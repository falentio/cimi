import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { closeDb, createDb, schema, type AnalyticsDb, type Db } from '@cimi/db'
import { generateId } from '@cimi/utils'
import type {
  RetentionCleanupBatchResult,
  RetentionCleanupPort,
} from '../retention-policy/cleanup.ts'
import type { RetentionPolicyRepository } from '../retention-policy/repository.ts'
import type { AcceptanceRepository } from './repository.ts'
import type { BackupRestoreCleanupPort } from '../backup-restore/cleanup.ts'
import {
  decodeRetentionManifest,
  encodeRetentionManifest,
} from '../backup-restore/retention-manifest.ts'
import {
  scrubAcceptedEventIdentity,
  scrubCanonicalEventPayloads,
} from '../backup-restore/identity-redaction.ts'

export interface AcceptanceRetentionCleanupDependencies {
  readonly acceptance: AcceptanceRepository
  readonly analytics?: AnalyticsDb | undefined
  readonly db?: Db | undefined
  readonly dataDirectoryPath?: string | undefined
}

export class AcceptanceRetentionCleanup implements RetentionCleanupPort {
  private readonly acceptance: AcceptanceRepository
  private readonly analytics: AnalyticsDb | undefined
  private readonly db: Db | undefined
  private readonly dataDirectoryPath: string | undefined

  constructor({
    acceptance,
    analytics,
    db,
    dataDirectoryPath,
  }: AcceptanceRetentionCleanupDependencies) {
    this.acceptance = acceptance
    this.analytics = analytics
    this.db = db
    this.dataDirectoryPath = dataDirectoryPath
  }

  async runIdentityDerived(input: { readonly now: Date }): Promise<void> {
    if (this.db === undefined || !hasPendingIdentityRedactions(this.db)) return
    if (this.analytics === undefined) throw new Error('Analytics cleanup is not configured')
    preparePendingIdentityRedactions({ db: this.db, now: input.now })
    await this.analytics.rebuild({ controlDb: this.db })
    markProfileDerivedCleanupComplete({ db: this.db, now: input.now })
  }

  async runIdentityBackup(input: { readonly now: Date }): Promise<void> {
    if (this.db === undefined || !hasPendingIdentityBackupCleanup(this.db)) return
    if (this.dataDirectoryPath === undefined) throw new Error('Backup cleanup is not configured')
    await cleanBackupIdentityArtifacts({
      db: this.db,
      dataDirectoryPath: this.dataDirectoryPath,
    })
    markBackupCleanupComplete({ db: this.db, now: input.now })
  }

  async runDerived(input: {
    runId: string
    siteId: string
    now: Date
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult> {
    const dataClasses = new Set(input.checkpoints.map((checkpoint) => checkpoint.dataClass))
    const needsProfileCleanup =
      dataClasses.has('profiles') ||
      dataClasses.has('aliases') ||
      dataClasses.has('traits') ||
      dataClasses.has('identity-projections')
    const needsAnalytics =
      needsProfileCleanup ||
      dataClasses.has('sessions') ||
      dataClasses.has('visitors') ||
      dataClasses.has('goals') ||
      dataClasses.has('funnels') ||
      dataClasses.has('cohorts')
    if (needsAnalytics && this.analytics === undefined) {
      throw new Error('Analytics cleanup is not configured')
    }
    if (needsProfileCleanup && this.db === undefined) {
      throw new Error('Identity cleanup is not configured')
    }
    if (needsProfileCleanup && this.db !== undefined) {
      prepareExpiredProfiles({
        db: this.db,
        boundary: input.boundary,
        now: input.now,
      })
    }
    if (needsProfileCleanup && this.analytics !== undefined && this.db !== undefined) {
      await this.analytics.rebuild({ controlDb: this.db })
      markProfileDerivedCleanupComplete({
        db: this.db,
        siteId: input.siteId,
        now: input.now,
      })
    }
    if (dataClasses.has('replay-material') && input.boundary.replayReceiptCutoffAt !== null) {
      await this.acceptance.deleteExpiredReplayMaterial({
        siteId: input.siteId,
        receiptCutoff: input.boundary.replayReceiptCutoffAt,
      })
    }
    if (needsAnalytics && this.analytics !== undefined) {
      await this.analytics.deleteExpired({
        siteId: input.siteId,
        occurrenceCutoff: input.boundary.eventOccurrenceCutoffAt,
      })
    }
    if (
      dataClasses.has('accepted-events') ||
      dataClasses.has('raw-event-payloads') ||
      dataClasses.has('acceptance-journal')
    ) {
      await this.acceptance.deleteExpired({
        siteId: input.siteId,
        receiptCutoff: input.boundary.rawReceiptCutoffAt,
      })
    }
    return { completed: true, cursor: null, processedThrough: input.boundary.rawReceiptCutoffAt }
  }

  async runBackup(input: {
    runId: string
    siteId: string
    now: Date
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult> {
    if (this.db === undefined || this.dataDirectoryPath === undefined) {
      throw new Error('Backup cleanup is not configured')
    }
    await cleanBackupArtifacts({
      db: this.db,
      dataDirectoryPath: this.dataDirectoryPath,
      boundary: input.boundary,
      now: input.now,
    })
    return { completed: true, cursor: null, processedThrough: input.boundary.rawReceiptCutoffAt }
  }
}

export interface AcceptanceBackupRestoreCleanupDependencies {
  readonly acceptance: AcceptanceRepository
  readonly analytics: AnalyticsDb
  readonly db: Db
  readonly dataDirectoryPath: string
  readonly clock?: (() => Date) | undefined
}

export class AcceptanceBackupRestoreCleanup implements BackupRestoreCleanupPort {
  private readonly acceptance: AcceptanceRepository
  private readonly analytics: AnalyticsDb
  private readonly db: Db
  private readonly dataDirectoryPath: string
  private readonly clock: () => Date

  constructor({
    acceptance,
    analytics,
    db,
    dataDirectoryPath,
    clock,
  }: AcceptanceBackupRestoreCleanupDependencies) {
    this.acceptance = acceptance
    this.analytics = analytics
    this.db = db
    this.dataDirectoryPath = dataDirectoryPath
    this.clock = clock ?? (() => new Date())
  }

  async runDerived(_input: { readonly operationId: string }): Promise<void> {
    const now = this.clock()
    const boundaries = effectiveRetentionBoundaries(this.db)
    for (const boundary of boundaries) prepareExpiredProfiles({ db: this.db, boundary, now })
    if (!hasPendingIdentityRedactions(this.db) && boundaries.length === 0) return
    await this.analytics.rebuild({ controlDb: this.db })
    if (hasPendingIdentityRedactions(this.db)) {
      preparePendingIdentityRedactions({ db: this.db, now })
      markProfileDerivedCleanupComplete({ db: this.db, now })
    }
    for (const boundary of boundaries) {
      markProfileDerivedCleanupComplete({ db: this.db, siteId: boundary.siteId, now })
      if (boundary.replayReceiptCutoffAt !== null) {
        await this.acceptance.deleteExpiredReplayMaterial({
          siteId: boundary.siteId,
          receiptCutoff: boundary.replayReceiptCutoffAt,
        })
      }
      await this.analytics.deleteExpired({
        siteId: boundary.siteId,
        occurrenceCutoff: boundary.eventOccurrenceCutoffAt,
      })
      await this.acceptance.deleteExpired({
        siteId: boundary.siteId,
        receiptCutoff: boundary.rawReceiptCutoffAt,
      })
    }
  }

  async runBackup(_input: { readonly operationId: string }): Promise<void> {
    const now = this.clock()
    for (const boundary of effectiveRetentionBoundaries(this.db)) {
      await cleanBackupArtifacts({
        db: this.db,
        dataDirectoryPath: this.dataDirectoryPath,
        boundary,
        now,
      })
    }
    if (hasPendingIdentityBackupCleanup(this.db)) {
      await cleanBackupIdentityArtifacts({
        db: this.db,
        dataDirectoryPath: this.dataDirectoryPath,
      })
      markBackupCleanupComplete({ db: this.db, now })
    }
  }
}

function effectiveRetentionBoundaries(
  db: Db,
): readonly RetentionPolicyRepository.SiteRetentionBoundary[] {
  return db
    .select()
    .from(schema.TRetentionEffectiveCutoff)
    .all()
    .map((boundary) => ({
      siteId: boundary.siteId,
      installationId: boundary.installationId,
      policyId: boundary.policyId,
      reportingTimezone: boundary.reportingTimezone,
      localDay: boundary.localDay,
      eventOccurrenceCutoffAt: boundary.eventOccurrenceCutoffAt,
      rawReceiptCutoffAt: boundary.rawReceiptCutoffAt,
      profileActivityCutoffAt: boundary.profileActivityCutoffAt,
      replayReceiptCutoffAt: boundary.replayReceiptCutoffAt,
      effectiveAt: boundary.effectiveAt,
      updatedAt: boundary.updatedAt,
    }))
}

function prepareExpiredProfiles(input: {
  readonly db: Db
  readonly boundary: RetentionPolicyRepository.SiteRetentionBoundary
  readonly now: Date
}): void {
  input.db.$client.transaction(() => {
    const profiles = input.db.$client
      .prepare(
        `SELECT profile_id AS profileId, site_id AS siteId,
                identified_user_id AS identifiedUserId, status, profile_epoch AS profileEpoch
         FROM identity_profile
         WHERE site_id = ?
           AND ((status = 'active' AND last_seen_at < ?)
                OR status IN ('deletion-requested', 'deleting'))`,
      )
      .all(
        input.boundary.siteId,
        input.boundary.profileActivityCutoffAt.getTime(),
      ) as IdentityProfileCleanupRow[]
    for (const profile of profiles) prepareProfileRedaction(input.db, profile, input.now)
  })()
}

function preparePendingIdentityRedactions(input: { readonly db: Db; readonly now: Date }): void {
  input.db.$client.transaction(() => {
    const profiles = input.db.$client
      .prepare(
        `SELECT p.profile_id AS profileId, p.site_id AS siteId,
                p.identified_user_id AS identifiedUserId, p.status,
                p.profile_epoch AS profileEpoch
         FROM identity_profile p
         JOIN identity_redaction r ON r.profile_id = p.profile_id
          AND r.profile_epoch = p.profile_epoch
         WHERE r.derived_cleanup_status = 'pending'`,
      )
      .all() as IdentityProfileCleanupRow[]
    for (const profile of profiles) prepareProfileRedaction(input.db, profile, input.now)
  })()
}

interface IdentityProfileCleanupRow {
  readonly profileId: string
  readonly siteId: string
  readonly identifiedUserId: string
  readonly status: 'active' | 'deletion-requested' | 'deleting' | 'deleted'
  readonly profileEpoch: number | null
}

function prepareProfileRedaction(db: Db, profile: IdentityProfileCleanupRow, now: Date): void {
  if (profile.profileEpoch === null) return
  const reason = profile.status === 'active' ? 'retention' : 'explicit'
  db.$client
    .prepare(
      `INSERT OR IGNORE INTO identity_redaction
       (id, site_id, profile_id, identified_user_id, profile_epoch, reason, status,
        requested_at, applied_at, derived_cleanup_status, backup_cleanup_status,
        derived_cleanup_updated_at, backup_cleanup_updated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NULL, 'pending', 'pending', ?, ?, ?, ?)`,
    )
    .run(
      generateId('ird'),
      profile.siteId,
      profile.profileId,
      profile.identifiedUserId,
      profile.profileEpoch,
      reason,
      now.getTime(),
      now.getTime(),
      now.getTime(),
      now.getTime(),
      now.getTime(),
    )
  db.$client
    .prepare(
      `UPDATE identity_link
       SET unlinked_at = COALESCE(unlinked_at, ?)
       WHERE profile_id = ? AND profile_epoch = ?`,
    )
    .run(now.getTime(), profile.profileId, profile.profileEpoch)
  db.$client
    .prepare(
      `UPDATE identity_profile_epoch
       SET status = 'redacted', ended_at = COALESCE(ended_at, ?),
           redacted_at = COALESCE(redacted_at, ?)
       WHERE profile_id = ?`,
    )
    .run(now.getTime(), now.getTime(), profile.profileId)
  db.$client
    .prepare(
      `UPDATE identity_profile
       SET status = CASE WHEN status = 'deleted' THEN 'deleted' ELSE 'deleting' END,
           traits = NULL, updated_at = ?
       WHERE profile_id = ?`,
    )
    .run(now.getTime(), profile.profileId)
}

function hasPendingIdentityRedactions(db: Db): boolean {
  const row = db.$client
    .prepare(
      `SELECT 1 AS pending
       FROM identity_redaction
       WHERE derived_cleanup_status = 'pending'
       LIMIT 1`,
    )
    .get() as { readonly pending: number } | undefined
  return row !== undefined
}

function hasPendingIdentityBackupCleanup(db: Db): boolean {
  const row = db.$client
    .prepare(
      `SELECT 1 AS pending
       FROM identity_redaction
       WHERE derived_cleanup_status = 'complete'
         AND backup_cleanup_status = 'pending'
       LIMIT 1`,
    )
    .get() as { readonly pending: number } | undefined
  return row !== undefined
}

function markProfileDerivedCleanupComplete(input: {
  readonly db: Db
  readonly siteId?: string | undefined
  readonly now: Date
}): void {
  const siteClause = input.siteId === undefined ? '' : ' AND site_id = ?'
  const values =
    input.siteId === undefined
      ? [input.now.getTime(), input.now.getTime(), input.now.getTime()]
      : [input.now.getTime(), input.now.getTime(), input.now.getTime(), input.siteId]
  input.db.$client
    .prepare(
      `UPDATE identity_redaction
       SET status = 'applied', applied_at = COALESCE(applied_at, ?),
           derived_cleanup_status = 'complete', derived_cleanup_updated_at = ?, updated_at = ?
       WHERE derived_cleanup_status = 'pending'${siteClause}`,
    )
    .run(...values)
  input.db.$client
    .prepare(
      `UPDATE identity_profile
       SET status = 'deleted', traits = NULL, updated_at = ?
       WHERE status = 'deleting'
         AND profile_id IN (
           SELECT profile_id FROM identity_redaction
           WHERE derived_cleanup_status = 'complete'${siteClause}
         )`,
    )
    .run(
      ...(input.siteId === undefined ? [input.now.getTime()] : [input.now.getTime(), input.siteId]),
    )
  input.db.$client
    .prepare(
      `DELETE FROM identity_link
       WHERE profile_id IN (
         SELECT profile_id FROM identity_redaction
         WHERE derived_cleanup_status = 'complete'${siteClause}
       )`,
    )
    .run(...(input.siteId === undefined ? [] : [input.siteId]))
}

interface BackupArtifactRow {
  readonly id: string
  readonly storageKey: string
  readonly metadata: string | null
}

async function cleanBackupArtifacts(input: {
  readonly db: Db
  readonly dataDirectoryPath: string
  readonly boundary: RetentionPolicyRepository.SiteRetentionBoundary
  readonly now: Date
}): Promise<void> {
  const identityRedactions = pendingIdentityRedactions(input.db, input.boundary.siteId)
  const artifacts = input.db.$client
    .prepare(
      `SELECT ba.id, ba.storage_key AS storageKey, ba.metadata
       FROM backup_artifact ba
       JOIN backup_operation bo ON bo.id = ba.operation_id
       WHERE ba.artifact_type = 'authoritative_sqlite' AND bo.status = 'available'`,
    )
    .all() as BackupArtifactRow[]
  for (const artifact of artifacts) {
    const path = resolveBackupPath(input.dataDirectoryPath, artifact.storageKey)
    const backupDb = createDb({ path })
    try {
      backupDb.$client.transaction(() => {
        if (input.boundary.replayReceiptCutoffAt !== null) {
          backupDb.$client
            .prepare(
              `DELETE FROM event_payload
               WHERE event_pk IN (
                 SELECT event_pk FROM accepted_event
                 WHERE site_id = ? AND receipt_time < ?
               )`,
            )
            .run(input.boundary.siteId, input.boundary.replayReceiptCutoffAt.getTime())
        }
        backupDb.$client
          .prepare(
            `DELETE FROM accepted_event
             WHERE site_id = ? AND receipt_time < ?`,
          )
          .run(input.boundary.siteId, input.boundary.rawReceiptCutoffAt.getTime())
        const expiredProfiles = backupDb.$client
          .prepare(
            `SELECT p.profile_id AS profileId, p.identified_user_id AS identifiedUserId,
                    e.started_at AS epochStartedAt, e.ended_at AS epochEndedAt
             FROM identity_profile p
             LEFT JOIN identity_profile_epoch e
               ON e.profile_id = p.profile_id AND e.epoch = p.profile_epoch
             WHERE p.site_id = ? AND (p.status <> 'active' OR p.last_seen_at < ?)`,
          )
          .all(input.boundary.siteId, input.boundary.profileActivityCutoffAt.getTime()) as Array<{
          readonly profileId: string
          readonly identifiedUserId: string
          readonly epochStartedAt: number | null
          readonly epochEndedAt: number | null
        }>
        for (const profile of expiredProfiles) {
          scrubCanonicalEventPayloads(backupDb, {
            siteId: input.boundary.siteId,
            identifiedUserId: profile.identifiedUserId,
            epochStartedAt: profile.epochStartedAt,
            epochEndedAt: profile.epochEndedAt,
          })
          scrubAcceptedEventIdentity(backupDb, {
            siteId: input.boundary.siteId,
            identifiedUserId: profile.identifiedUserId,
            epochStartedAt: profile.epochStartedAt,
            epochEndedAt: profile.epochEndedAt,
          })
          backupDb.$client
            .prepare('DELETE FROM identity_redaction WHERE profile_id = ?')
            .run(profile.profileId)
          backupDb.$client
            .prepare('DELETE FROM identity_link WHERE profile_id = ?')
            .run(profile.profileId)
          backupDb.$client
            .prepare('DELETE FROM identity_profile_epoch WHERE profile_id = ?')
            .run(profile.profileId)
          backupDb.$client
            .prepare('DELETE FROM identity_profile WHERE profile_id = ?')
            .run(profile.profileId)
        }
        cleanBackupIdentityRows(backupDb, identityRedactions)
      })()
      backupDb.$client.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      closeDb(backupDb)
    }
    updateBackupMetadata({
      db: input.db,
      artifact,
      boundary: input.boundary,
      path,
    })
  }
  markBackupCleanupComplete({
    db: input.db,
    siteId: input.boundary.siteId,
    now: input.now,
  })
}

interface IdentityRedactionTarget {
  readonly siteId: string
  readonly profileId: string
  readonly identifiedUserId: string
  readonly profileEpoch: number
}

function pendingIdentityRedactions(db: Db, siteId?: string): IdentityRedactionTarget[] {
  const siteClause = siteId === undefined ? '' : ' AND site_id = ?'
  const rows = db.$client
    .prepare(
      `SELECT site_id AS siteId, profile_id AS profileId, identified_user_id AS identifiedUserId,
              profile_epoch AS profileEpoch
       FROM identity_redaction
       WHERE derived_cleanup_status = 'complete'
         AND backup_cleanup_status = 'pending'${siteClause}`,
    )
    .all(...(siteId === undefined ? [] : [siteId])) as IdentityRedactionTarget[]
  return rows
}

async function cleanBackupIdentityArtifacts(input: {
  readonly db: Db
  readonly dataDirectoryPath: string
}): Promise<void> {
  const targets = pendingIdentityRedactions(input.db)
  if (targets.length === 0) return
  const artifacts = input.db.$client
    .prepare(
      `SELECT ba.id, ba.storage_key AS storageKey, ba.metadata
       FROM backup_artifact ba
       JOIN backup_operation bo ON bo.id = ba.operation_id
       WHERE ba.artifact_type = 'authoritative_sqlite' AND bo.status = 'available'`,
    )
    .all() as BackupArtifactRow[]
  for (const artifact of artifacts) {
    const path = resolveBackupPath(input.dataDirectoryPath, artifact.storageKey)
    const backupDb = createDb({ path })
    try {
      backupDb.$client.transaction(() => cleanBackupIdentityRows(backupDb, targets))()
      backupDb.$client.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      closeDb(backupDb)
    }
    updateBackupMetadata({ db: input.db, artifact, path })
  }
}

function cleanBackupIdentityRows(db: Db, targets: readonly IdentityRedactionTarget[]): void {
  for (const target of targets) {
    const epoch = db.$client
      .prepare(
        `SELECT started_at AS startedAt, ended_at AS endedAt
         FROM identity_profile_epoch
         WHERE profile_id = ? AND epoch = ?`,
      )
      .get(target.profileId, target.profileEpoch) as
      | { readonly startedAt: number; readonly endedAt: number | null }
      | undefined
    const profile = db.$client
      .prepare(
        `SELECT profile_epoch AS profileEpoch, status
         FROM identity_profile
         WHERE profile_id = ?`,
      )
      .get(target.profileId) as
      | { readonly profileEpoch: number | null; readonly status: string }
      | undefined
    const boundary = {
      siteId: target.siteId,
      identifiedUserId: target.identifiedUserId,
      epochStartedAt: epoch?.startedAt ?? null,
      epochEndedAt: epoch?.endedAt ?? null,
    }
    scrubCanonicalEventPayloads(db, boundary)
    scrubAcceptedEventIdentity(db, boundary)
    db.$client
      .prepare('DELETE FROM identity_link WHERE profile_id = ? AND profile_epoch = ?')
      .run(target.profileId, target.profileEpoch)
    db.$client
      .prepare('DELETE FROM identity_redaction WHERE profile_id = ? AND profile_epoch = ?')
      .run(target.profileId, target.profileEpoch)
    db.$client
      .prepare('DELETE FROM identity_profile_epoch WHERE profile_id = ? AND epoch = ?')
      .run(target.profileId, target.profileEpoch)
    if (profile?.profileEpoch === target.profileEpoch) {
      db.$client.prepare('DELETE FROM identity_profile WHERE profile_id = ?').run(target.profileId)
    }
  }
}

function resolveBackupPath(dataDirectoryPath: string, storageKey: string): string {
  if (!/^backups\/[A-Za-z0-9_-]{1,64}\.sqlite$/.test(storageKey)) {
    throw new Error('Backup storage key is invalid')
  }
  const root = resolve(dataDirectoryPath)
  const path = resolve(root, storageKey)
  const fromRoot = relative(root, path)
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('Backup storage key is outside configured storage')
  }
  return path
}

function markBackupCleanupComplete(input: {
  readonly db: Db
  readonly siteId?: string | undefined
  readonly now: Date
}): void {
  const siteClause = input.siteId === undefined ? '' : ' AND site_id = ?'
  input.db.$client
    .prepare(
      `UPDATE identity_redaction
       SET backup_cleanup_status = 'complete', backup_cleanup_updated_at = ?, updated_at = ?
       WHERE derived_cleanup_status = 'complete' AND backup_cleanup_status = 'pending'${siteClause}`,
    )
    .run(
      input.now.getTime(),
      input.now.getTime(),
      ...(input.siteId === undefined ? [] : [input.siteId]),
    )
}

function updateBackupMetadata(input: {
  readonly db: Db
  readonly artifact: BackupArtifactRow
  readonly boundary?: RetentionPolicyRepository.SiteRetentionBoundary | undefined
  readonly path: string
}): void {
  const metadata = input.artifact.metadata === null ? null : JSON.parse(input.artifact.metadata)
  const manifest = decodeRetentionManifest(metadata)
  const boundary = input.boundary
  const nextMetadata =
    manifest === null || boundary === undefined
      ? metadata
      : encodeRetentionManifest({
          version: 1,
          boundaries: manifest.boundaries.map((manifestBoundary) =>
            manifestBoundary.siteId === boundary.siteId
              ? { ...manifestBoundary, ...boundary }
              : manifestBoundary,
          ),
        })
  const bytes = readFileSync(input.path)
  input.db.$client
    .prepare(
      `UPDATE backup_artifact
       SET size_bytes = ?, checksum_algorithm = 'sha256', checksum_value = ?, metadata = ?
       WHERE id = ?`,
    )
    .run(
      statSync(input.path).size,
      createHash('sha256').update(bytes).digest('hex'),
      nextMetadata === null ? null : JSON.stringify(nextMetadata),
      input.artifact.id,
    )
}
