import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { closeDb, createDb, schema, type AnalyticsDb, type Db } from '@cimi/db'
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
      cleanExpiredProfiles({
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
    for (const boundary of boundaries) cleanExpiredProfiles({ db: this.db, boundary, now })
    if (boundaries.length === 0) return
    await this.analytics.rebuild({ controlDb: this.db })
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

function cleanExpiredProfiles(input: {
  readonly db: Db
  readonly boundary: RetentionPolicyRepository.SiteRetentionBoundary
  readonly now: Date
}): void {
  input.db.$client.transaction(() => {
    const profiles = input.db.$client
      .prepare(
        `SELECT profile_id AS profileId
         FROM identity_profile
         WHERE site_id = ?
           AND (status <> 'active' OR last_seen_at < ?)`,
      )
      .all(input.boundary.siteId, input.boundary.profileActivityCutoffAt.getTime()) as Array<{
      readonly profileId: string
    }>
    for (const profile of profiles) {
      input.db.$client
        .prepare('DELETE FROM identity_link WHERE profile_id = ?')
        .run(profile.profileId)
      input.db.$client
        .prepare(
          `UPDATE identity_profile_epoch
           SET status = 'redacted', ended_at = COALESCE(ended_at, ?), redacted_at = COALESCE(redacted_at, ?)
           WHERE profile_id = ?`,
        )
        .run(input.now.getTime(), input.now.getTime(), profile.profileId)
      input.db.$client
        .prepare(
          `UPDATE identity_profile
           SET status = 'deleted', traits = NULL, updated_at = ?
           WHERE profile_id = ?`,
        )
        .run(input.now.getTime(), profile.profileId)
    }
  })()
}

function markProfileDerivedCleanupComplete(input: {
  readonly db: Db
  readonly siteId: string
  readonly now: Date
}): void {
  input.db.$client
    .prepare(
      `UPDATE identity_redaction
       SET status = 'applied', applied_at = COALESCE(applied_at, ?),
           derived_cleanup_status = 'complete', derived_cleanup_updated_at = ?, updated_at = ?
       WHERE site_id = ? AND derived_cleanup_status = 'pending'`,
    )
    .run(input.now.getTime(), input.now.getTime(), input.now.getTime(), input.siteId)
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
          backupDb.$client
            .prepare(
              `UPDATE accepted_event
               SET identified_user_id = NULL
               WHERE site_id = ? AND identified_user_id = ?
                 AND (? IS NULL OR occurrence_time >= ?)
                 AND (? IS NULL OR occurrence_time < ?)`,
            )
            .run(
              input.boundary.siteId,
              profile.identifiedUserId,
              profile.epochStartedAt,
              profile.epochStartedAt,
              profile.epochEndedAt,
              profile.epochEndedAt,
            )
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
  readonly siteId: string
  readonly now: Date
}): void {
  input.db.$client
    .prepare(
      `UPDATE identity_redaction
       SET backup_cleanup_status = 'complete', backup_cleanup_updated_at = ?, updated_at = ?
       WHERE site_id = ? AND derived_cleanup_status = 'complete' AND backup_cleanup_status = 'pending'`,
    )
    .run(input.now.getTime(), input.now.getTime(), input.siteId)
}

function updateBackupMetadata(input: {
  readonly db: Db
  readonly artifact: BackupArtifactRow
  readonly boundary: RetentionPolicyRepository.SiteRetentionBoundary
  readonly path: string
}): void {
  const metadata = input.artifact.metadata === null ? null : JSON.parse(input.artifact.metadata)
  const manifest = decodeRetentionManifest(metadata)
  const nextMetadata =
    manifest === null
      ? metadata
      : encodeRetentionManifest({
          version: 1,
          boundaries: manifest.boundaries.map((boundary) =>
            boundary.siteId === input.boundary.siteId
              ? { ...boundary, ...input.boundary }
              : boundary,
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
