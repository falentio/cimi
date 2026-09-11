import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { and, asc, eq, inArray, ne } from 'drizzle-orm'
import {
  ControlMigrationIncompatibilityError,
  closeDb,
  createDb,
  migrateControlDb,
  restoreDbFromBackup,
  validateBaseSchema,
  type AnalyticsDb,
  type Db,
  schema,
} from '@cimi/db'
import type { SafetyManifest, SourceManifest } from './repository.ts'
import { BackupIncompatibilityError } from './errors.ts'
import {
  encodeRetentionManifest,
  type RetentionManifest,
  type RetentionManifestBoundary,
} from './retention-manifest.ts'
import { scrubAcceptedEventIdentity, scrubCanonicalEventPayloads } from './identity-redaction.ts'

export { BackupIncompatibilityError } from './errors.ts'
export class InsufficientStorageError extends Error {}
export class SafetyArtifactUnavailableError extends Error {}
export class SafetyArtifactChecksumMismatchError extends Error {}

export interface BackupRestoreExecutor {
  captureBackup(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly lastSafeSequence: number
  }): Promise<SourceManifest>
  createPreRestoreSafety(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly lastSafeSequence: number
  }): Promise<SafetyManifest>
  validateManifest(input: {
    readonly operationId: string
    readonly source: SourceManifest
  }): Promise<void>
  restoreSqlite(input: {
    readonly operationId: string
    readonly source: SourceManifest
  }): Promise<void>
  migrate(input: { readonly operationId: string }): Promise<void>
  rebuildAnalytics(input: { readonly operationId: string }): Promise<void>
  verifyStructuralReadiness(input: { readonly operationId: string }): Promise<void>
  rollback(input: { readonly operationId: string; readonly safety: SafetyManifest }): Promise<void>
}

export interface ConfiguredSqliteExecutorDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
  readonly controlDatabasePath: string
  readonly dataDirectoryPath: string
  readonly analyticsRebuild?:
    | ((input: { readonly operationId: string }) => void | Promise<void>)
    | undefined
}

export class ConfiguredSqliteExecutor implements BackupRestoreExecutor {
  private readonly db: Db
  private readonly analytics: AnalyticsDb
  private readonly controlDatabasePath: string
  private readonly dataDirectoryPath: string
  private readonly analyticsRebuild: (input: {
    readonly operationId: string
  }) => void | Promise<void>

  constructor({
    db,
    analytics,
    controlDatabasePath,
    dataDirectoryPath,
    analyticsRebuild,
  }: ConfiguredSqliteExecutorDependencies) {
    this.db = db
    this.analytics = analytics
    this.controlDatabasePath = controlDatabasePath
    this.dataDirectoryPath = dataDirectoryPath
    this.analyticsRebuild =
      analyticsRebuild ?? (() => this.analytics.rebuild({ controlDb: this.db }))
  }

  async captureBackup(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly lastSafeSequence: number
  }): Promise<SourceManifest> {
    assertSafeOperationId(input.operationId)
    const storageKey = `backups/${input.operationId}.sqlite`
    return this.capture({
      operationId: input.operationId,
      artifactId: input.artifactId,
      storageKey,
      lastSafeSequence: input.lastSafeSequence,
      kind: 'source',
    })
  }

  async createPreRestoreSafety(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly lastSafeSequence: number
  }): Promise<SafetyManifest> {
    assertSafeOperationId(input.operationId)
    const storageKey = `safety/${input.operationId}.sqlite`
    const captured = await this.capture({
      operationId: input.operationId,
      artifactId: input.artifactId,
      storageKey,
      lastSafeSequence: input.lastSafeSequence,
      kind: 'safety',
    })
    return {
      ...captured,
      kind: 'safety',
      artifactType: 'pre_restore_sqlite',
      lastSafeSequence: input.lastSafeSequence,
      status: 'ready',
      errorCode: null,
    }
  }

  async validateManifest(input: {
    readonly operationId: string
    readonly source: SourceManifest
  }): Promise<void> {
    assertSafeOperationId(input.operationId)
    if (input.source.kind !== 'source' || input.source.artifactType !== 'authoritative_sqlite') {
      throw new BackupIncompatibilityError('Backup manifest has an invalid artifact type')
    }
    if (input.source.schemaVersion !== '1') {
      throw new BackupIncompatibilityError('Backup manifest is not compatible')
    }
    const path = this.resolveStoragePath(input.source.storageKey, 'backups')
    await verifyArtifact(path, input.source.sizeBytes, input.source.checksumValue)
    verifySqliteIntegrity(path, input.source.retentionManifest === null)
    if (input.source.retentionManifest !== null) {
      encodeRetentionManifest(input.source.retentionManifest)
    }
  }

  async restoreSqlite(input: {
    readonly operationId: string
    readonly source: SourceManifest
  }): Promise<void> {
    assertSafeOperationId(input.operationId)
    const tombstones = this.db.$client
      .prepare(
        'SELECT site_id AS siteId, organization_id AS organizationId, hostname, purge_operation_id AS purgeOperationId, purged_at AS purgedAt, created_at AS createdAt FROM site_tombstone',
      )
      .all() as TombstoneRow[]
    const redactions = this.db.$client
      .prepare(
        'SELECT id, site_id AS siteId, profile_id AS profileId, identified_user_id AS identifiedUserId, profile_epoch AS profileEpoch, reason, status, requested_at AS requestedAt, applied_at AS appliedAt, derived_cleanup_status AS derivedCleanupStatus, backup_cleanup_status AS backupCleanupStatus, derived_cleanup_updated_at AS derivedCleanupUpdatedAt, backup_cleanup_updated_at AS backupCleanupUpdatedAt, created_at AS createdAt, updated_at AS updatedAt FROM identity_redaction',
      )
      .all() as RedactionRow[]
    const siteLifecycle = this.captureSiteLifecycle()
    const lifecycle = this.captureRestoreLifecycle(input.operationId)
    const path = this.resolveStoragePath(input.source.storageKey, 'backups')
    await restoreDbFromBackup({
      backupPath: path,
      destinationPath: this.controlDatabasePath,
      db: this.db,
      prepare: async (stagedDb) => {
        try {
          migrateControlDb(stagedDb)
        } catch (error) {
          if (error instanceof ControlMigrationIncompatibilityError) {
            throw new BackupIncompatibilityError('Backup migration is not compatible')
          }
          if (classifyStorageExhausted(error)) {
            throw new InsufficientStorageError('Backup migration could not be stored')
          }
          throw error
        }
        this.restoreRetentionManifest(stagedDb, input.source)
        this.restoreTombstones(stagedDb, tombstones)
        this.restoreRedactions(stagedDb, redactions)
        if (lifecycle !== undefined) this.restoreLifecycle(stagedDb, lifecycle, input.source)
        this.restoreSiteLifecycle(stagedDb, siteLifecycle, input.operationId)
      },
    })
  }

  async migrate(_input: { readonly operationId: string }): Promise<void> {
    try {
      migrateControlDb(this.db)
    } catch (error) {
      if (error instanceof ControlMigrationIncompatibilityError) {
        throw new BackupIncompatibilityError('Backup migration is not compatible')
      }
      if (classifyStorageExhausted(error)) {
        throw new InsufficientStorageError('Backup migration could not be stored')
      }
      throw error
    }
  }

  async rebuildAnalytics(input: { readonly operationId: string }): Promise<void> {
    await this.analyticsRebuild(input)
  }

  async verifyStructuralReadiness(_input: { readonly operationId: string }): Promise<void> {
    validateBaseSchema(this.db)
    if (!(await this.analytics.ready())) throw new Error('Analytics database is not ready')
  }

  async rollback(input: {
    readonly operationId: string
    readonly safety: SafetyManifest
  }): Promise<void> {
    assertSafeOperationId(input.operationId)
    if (input.safety.kind !== 'safety' || input.safety.artifactType !== 'pre_restore_sqlite') {
      throw new SafetyArtifactUnavailableError('Pre-restore safety artifact is invalid')
    }
    const path = this.resolveStoragePath(input.safety.storageKey, 'safety')
    try {
      await verifyArtifact(path, input.safety.sizeBytes, input.safety.checksumValue)
    } catch (error) {
      if (error instanceof InsufficientStorageError) throw error
      throw new SafetyArtifactChecksumMismatchError('Pre-restore safety artifact checksum failed')
    }
    await restoreDbFromBackup({
      backupPath: path,
      destinationPath: this.controlDatabasePath,
      prepare: (stagedDb) => this.restoreSafetyMetadata(stagedDb, input.operationId, input.safety),
      db: this.db,
    })
    await this.analyticsRebuild({ operationId: input.operationId })
  }

  private restoreSafetyMetadata(db: Db, operationId: string, safety: SafetyManifest): void {
    db.transaction((tx) => {
      const operation = tx
        .select({ id: schema.TBackupOperation.id })
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.id, operationId))
        .limit(1)
        .all()[0]
      const reference = tx
        .select()
        .from(schema.TBackupRestoreReference)
        .where(eq(schema.TBackupRestoreReference.operationId, operationId))
        .limit(1)
        .all()[0]
      if (
        operation === undefined ||
        reference === undefined ||
        safety.operationId !== operationId
      ) {
        throw new SafetyArtifactUnavailableError('Pre-restore safety metadata is unavailable')
      }
      const existing = tx
        .select()
        .from(schema.TBackupArtifact)
        .where(eq(schema.TBackupArtifact.id, safety.id))
        .limit(1)
        .all()[0]
      if (existing === undefined) {
        tx.insert(schema.TBackupArtifact)
          .values({
            id: safety.id,
            operationId,
            artifactType: 'pre_restore_sqlite',
            generationId: safety.generationId,
            storageKey: safety.storageKey,
            schemaVersion: safety.schemaVersion,
            retentionBoundary: null,
            acceptanceSequence: safety.lastSafeSequence,
            sizeBytes: safety.sizeBytes,
            checksumAlgorithm: safety.checksumAlgorithm,
            checksumValue: safety.checksumValue,
            metadata: null,
            createdAt: safety.createdAt,
          })
          .run()
      } else if (
        existing.operationId !== operationId ||
        existing.artifactType !== 'pre_restore_sqlite'
      ) {
        throw new SafetyArtifactUnavailableError('Pre-restore safety metadata is invalid')
      }
      if (
        reference.preRestoreSafetyArtifactId !== null &&
        reference.preRestoreSafetyArtifactId !== safety.id
      ) {
        throw new SafetyArtifactUnavailableError('Pre-restore safety metadata is invalid')
      }
      tx.update(schema.TBackupRestoreReference)
        .set({ preRestoreSafetyArtifactId: safety.id })
        .where(eq(schema.TBackupRestoreReference.operationId, operationId))
        .run()
    })
  }

  private async capture(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly storageKey: string
    readonly lastSafeSequence: number
    readonly kind: 'source'
  }): Promise<SourceManifest>
  private async capture(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly storageKey: string
    readonly lastSafeSequence: number
    readonly kind: 'safety'
  }): Promise<SafetyManifest>
  private async capture(input: {
    readonly operationId: string
    readonly artifactId: string
    readonly storageKey: string
    readonly lastSafeSequence: number
    readonly kind: 'source' | 'safety'
  }): Promise<SourceManifest | SafetyManifest> {
    const path = this.resolveStoragePath(
      input.storageKey,
      input.kind === 'source' ? 'backups' : 'safety',
    )
    try {
      await mkdir(dirname(path), { recursive: true })
      const retentionManifest = input.kind === 'source' ? this.captureRetentionManifest() : null
      const redactions = this.captureIdentityRedactions()
      await this.db.$client.backup(path)
      this.scrubCapturedIdentityData(path, redactions)
      const artifactStats = await stat(path)
      if (!artifactStats.isFile() || artifactStats.size === 0) {
        throw new InsufficientStorageError('SQLite artifact is empty')
      }
      const checksumValue = createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
      const common = {
        id: input.artifactId,
        operationId: input.operationId,
        generationId: input.operationId,
        storageKey: input.storageKey,
        schemaVersion: '1',
        sizeBytes: artifactStats.size,
        checksumAlgorithm: 'sha256' as const,
        checksumValue,
        createdAt: new Date(),
      }
      if (input.kind === 'source') {
        return {
          kind: 'source',
          ...common,
          artifactType: 'authoritative_sqlite',
          retentionBoundary: null,
          retentionManifest,
          acceptanceSequence: input.lastSafeSequence,
        }
      }
      return {
        kind: 'safety',
        ...common,
        artifactType: 'pre_restore_sqlite',
        lastSafeSequence: input.lastSafeSequence,
        status: 'ready',
        errorCode: null,
      }
    } catch (error) {
      if (error instanceof InsufficientStorageError) throw error
      if (classifyStorageExhausted(error)) {
        throw new InsufficientStorageError('SQLite artifact storage failed')
      }
      throw error
    }
  }

  private captureRetentionManifest(): RetentionManifest {
    const rows = this.db
      .select()
      .from(schema.TRetentionEffectiveCutoff)
      .orderBy(asc(schema.TRetentionEffectiveCutoff.siteId))
      .all()
    const boundaries: RetentionManifestBoundary[] = rows.map((row) => ({
      siteId: row.siteId,
      installationId: row.installationId,
      policyId: row.policyId,
      reportingTimezone: row.reportingTimezone,
      localDay: row.localDay,
      eventOccurrenceCutoffAt: row.eventOccurrenceCutoffAt,
      rawReceiptCutoffAt: row.rawReceiptCutoffAt,
      profileActivityCutoffAt: row.profileActivityCutoffAt,
      replayReceiptCutoffAt: row.replayReceiptCutoffAt,
      effectiveAt: row.effectiveAt,
      updatedAt: row.updatedAt,
    }))
    return { version: 1, boundaries }
  }

  private captureIdentityRedactions(): readonly RedactionRow[] {
    return this.db.$client
      .prepare(
        `SELECT id, site_id AS siteId, profile_id AS profileId,
                identified_user_id AS identifiedUserId, profile_epoch AS profileEpoch,
                reason, status, requested_at AS requestedAt, applied_at AS appliedAt,
                derived_cleanup_status AS derivedCleanupStatus,
                backup_cleanup_status AS backupCleanupStatus,
                derived_cleanup_updated_at AS derivedCleanupUpdatedAt,
                backup_cleanup_updated_at AS backupCleanupUpdatedAt,
                created_at AS createdAt, updated_at AS updatedAt
         FROM identity_redaction`,
      )
      .all() as RedactionRow[]
  }

  private scrubCapturedIdentityData(path: string, redactions: readonly RedactionRow[]): void {
    if (redactions.length === 0) return
    const backupDb = createDb({ path })
    try {
      backupDb.$client.transaction(() => {
        for (const redaction of redactions) {
          this.applyRedactionToDatabase(backupDb, redaction)
        }
      })()
      backupDb.$client.pragma('wal_checkpoint(TRUNCATE)')
    } finally {
      closeDb(backupDb)
    }
  }

  private restoreRetentionManifest(db: Db, source: SourceManifest): void {
    if (source.retentionManifest === null) return
    const manifest = source.retentionManifest
    encodeRetentionManifest(manifest)
    try {
      db.transaction((tx) => {
        const siteIds = uniqueIds(manifest.boundaries.map((row) => row.siteId))
        const installationIds = uniqueIds(manifest.boundaries.map((row) => row.installationId))
        const policyIds = uniqueIds(manifest.boundaries.map((row) => row.policyId))
        const sites =
          siteIds.length === 0
            ? []
            : tx
                .select({ id: schema.TSite.id })
                .from(schema.TSite)
                .where(inArray(schema.TSite.id, siteIds))
                .all()
        const installations =
          installationIds.length === 0
            ? []
            : tx
                .select({ id: schema.TInstallation.id })
                .from(schema.TInstallation)
                .where(inArray(schema.TInstallation.id, installationIds))
                .all()
        const policies =
          policyIds.length === 0
            ? []
            : tx
                .select({ id: schema.TRetentionPolicy.id })
                .from(schema.TRetentionPolicy)
                .where(inArray(schema.TRetentionPolicy.id, policyIds))
                .all()
        if (
          sites.length !== siteIds.length ||
          installations.length !== installationIds.length ||
          policies.length !== policyIds.length
        ) {
          throw new BackupIncompatibilityError('Retention manifest references missing rows')
        }
        tx.delete(schema.TRetentionEffectiveCutoff).run()
        if (manifest.boundaries.length > 0) {
          tx.insert(schema.TRetentionEffectiveCutoff)
            .values(manifest.boundaries.map((boundary) => ({ ...boundary })))
            .run()
        }
      })
    } catch (error) {
      if (error instanceof BackupIncompatibilityError) throw error
      throw new BackupIncompatibilityError('Retention manifest could not be restored')
    }
  }

  private resolveStoragePath(storageKey: string, directory: 'backups' | 'safety'): string {
    const expected = new RegExp(`^${directory}/[A-Za-z0-9_-]{1,64}\\.sqlite$`)
    if (!expected.test(storageKey))
      throw new BackupIncompatibilityError('Backup storage key is invalid')
    const root = resolve(this.dataDirectoryPath)
    const path = resolve(root, storageKey)
    const fromRoot = relative(root, path)
    if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new BackupIncompatibilityError('Backup storage key is outside configured storage')
    }
    return path
  }

  private restoreTombstones(db: Db, rows: readonly TombstoneRow[]): void {
    const insert = db.$client.prepare(
      'INSERT OR REPLACE INTO site_tombstone (site_id, organization_id, hostname, purge_operation_id, purged_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const row of rows) {
      insert.run(
        row.siteId,
        row.organizationId,
        row.hostname,
        row.purgeOperationId,
        row.purgedAt,
        row.createdAt,
      )
    }
  }

  private captureSiteLifecycle(): readonly SiteLifecycleState[] {
    const sites = this.db.select().from(schema.TSite).where(ne(schema.TSite.status, 'active')).all()
    const operationIds = sites.flatMap((site) =>
      site.currentOperationId === null ? [] : [site.currentOperationId],
    )
    const operations =
      operationIds.length === 0
        ? []
        : this.db
            .select()
            .from(schema.TSiteLifecycleOperation)
            .where(inArray(schema.TSiteLifecycleOperation.id, operationIds))
            .all()
    const operationsById = new Map(operations.map((operation) => [operation.id, operation]))
    return sites.map((site) => ({
      site,
      operation:
        site.currentOperationId === null ? undefined : operationsById.get(site.currentOperationId),
    }))
  }

  private restoreSiteLifecycle(
    db: Db,
    rows: readonly SiteLifecycleState[],
    restoreOperationId: string,
  ): void {
    const findSite = db.$client.prepare('SELECT 1 FROM site WHERE id = ?')
    const updateSite = db.$client.prepare(
      `UPDATE site
       SET status = ?, delete_requested_at = ?, deleted_at = ?, recovery_deadline = ?, purge_at = ?,
           purged_at = ?, current_operation_id = ?, cleanup_status = ?, cleanup_updated_at = ?,
           cleanup_error = ?
       WHERE id = ?`,
    )
    const insertOperation = db.$client.prepare(
      'INSERT OR IGNORE INTO site_lifecycle_operation (id, site_id, operation_type, status, requested_at, started_at, completed_at, error_summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const insertTombstone = db.$client.prepare(
      'INSERT OR REPLACE INTO site_tombstone (site_id, organization_id, hostname, purge_operation_id, purged_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const row of rows) {
      const site = row.site
      if (findSite.get(site.id) !== undefined) {
        updateSite.run(
          site.status,
          site.deleteRequestedAt?.getTime() ?? null,
          site.deletedAt?.getTime() ?? null,
          site.recoveryDeadline?.getTime() ?? null,
          site.purgeAt?.getTime() ?? null,
          site.purgedAt?.getTime() ?? null,
          site.currentOperationId,
          site.cleanupStatus,
          site.cleanupUpdatedAt?.getTime() ?? null,
          site.cleanupError,
          site.id,
        )
        if (row.operation !== undefined) {
          const operation = row.operation
          insertOperation.run(
            operation.id,
            operation.siteId,
            operation.operationType,
            operation.status,
            operation.requestedAt.getTime(),
            operation.startedAt?.getTime() ?? null,
            operation.completedAt?.getTime() ?? null,
            operation.errorSummary,
            operation.createdAt.getTime(),
            operation.updatedAt.getTime(),
          )
        }
        continue
      }
      const tombstoneTime = site.purgedAt ?? site.deletedAt ?? site.createdAt
      insertTombstone.run(
        site.id,
        site.organizationId,
        site.hostname,
        site.currentOperationId ?? restoreOperationId,
        tombstoneTime.getTime(),
        site.createdAt.getTime(),
      )
    }
  }

  private restoreRedactions(db: Db, rows: readonly RedactionRow[]): void {
    const insert = db.$client.prepare(
      'INSERT OR REPLACE INTO identity_redaction (id, site_id, profile_id, identified_user_id, profile_epoch, reason, status, requested_at, applied_at, derived_cleanup_status, backup_cleanup_status, derived_cleanup_updated_at, backup_cleanup_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const hasSite = db.$client.prepare('SELECT 1 FROM site WHERE id = ?')
    const hasProfile = db.$client.prepare('SELECT 1 FROM identity_profile WHERE profile_id = ?')
    const hasEpoch = db.$client.prepare(
      'SELECT 1 FROM identity_profile_epoch WHERE profile_id = ? AND epoch = ?',
    )
    const insertProfile = db.$client.prepare(
      `INSERT OR IGNORE INTO identity_profile
       (profile_id, site_id, identified_user_id, status, profile_epoch, traits,
        first_seen_at, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, 'deleted', ?, NULL, ?, ?, ?, ?)`,
    )
    const insertEpoch = db.$client.prepare(
      `INSERT OR IGNORE INTO identity_profile_epoch
       (profile_id, site_id, identified_user_id, epoch, status, started_at, ended_at, redacted_at)
       VALUES (?, ?, ?, ?, 'redacted', ?, ?, ?)`,
    )
    for (const row of rows) {
      if (hasSite.get(row.siteId) === undefined) continue
      const profileExists = hasProfile.get(row.profileId) !== undefined
      if (!profileExists) {
        insertProfile.run(
          row.profileId,
          row.siteId,
          row.identifiedUserId,
          row.profileEpoch,
          row.requestedAt,
          row.requestedAt,
          row.createdAt,
          row.updatedAt,
        )
      }
      const epochExists = hasEpoch.get(row.profileId, row.profileEpoch) !== undefined
      if (!epochExists) {
        const redactedAt = row.appliedAt ?? row.requestedAt
        insertEpoch.run(
          row.profileId,
          row.siteId,
          row.identifiedUserId,
          row.profileEpoch,
          row.requestedAt,
          redactedAt,
          redactedAt,
        )
      }
      insert.run(
        row.id,
        row.siteId,
        row.profileId,
        row.identifiedUserId,
        row.profileEpoch,
        row.reason,
        row.status,
        row.requestedAt,
        row.appliedAt,
        row.derivedCleanupStatus,
        row.backupCleanupStatus,
        row.derivedCleanupUpdatedAt,
        row.backupCleanupUpdatedAt,
        row.createdAt,
        row.updatedAt,
      )
      this.applyRedactionToDatabase(db, row, !epochExists)
    }
  }

  private applyRedactionToDatabase(db: Db, row: RedactionRow, scrubAll = false): void {
    const epoch = db.$client
      .prepare(
        `SELECT started_at AS startedAt, ended_at AS endedAt
         FROM identity_profile_epoch
         WHERE profile_id = ? AND epoch = ?`,
      )
      .get(row.profileId, row.profileEpoch) as
      | { readonly startedAt: number; readonly endedAt: number | null }
      | undefined
    const profile = db.$client
      .prepare(
        `SELECT profile_epoch AS profileEpoch
         FROM identity_profile
         WHERE profile_id = ?`,
      )
      .get(row.profileId) as { readonly profileEpoch: number | null } | undefined
    const redactedAt = row.appliedAt ?? row.requestedAt
    const boundary = {
      siteId: row.siteId,
      identifiedUserId: row.identifiedUserId,
      epochStartedAt: scrubAll ? null : (epoch?.startedAt ?? null),
      epochEndedAt: scrubAll ? null : (epoch?.endedAt ?? null),
    }
    scrubCanonicalEventPayloads(db, boundary)
    scrubAcceptedEventIdentity(db, boundary)
    if (epoch === undefined) return
    db.$client
      .prepare(
        `UPDATE identity_profile_epoch
         SET status = 'redacted', ended_at = COALESCE(ended_at, ?),
             redacted_at = COALESCE(redacted_at, ?)
         WHERE profile_id = ? AND epoch = ?`,
      )
      .run(redactedAt, redactedAt, row.profileId, row.profileEpoch)
    db.$client
      .prepare(
        `UPDATE identity_link
         SET unlinked_at = COALESCE(unlinked_at, ?)
         WHERE profile_id = ? AND profile_epoch = ?`,
      )
      .run(redactedAt, row.profileId, row.profileEpoch)
    if (profile?.profileEpoch === row.profileEpoch) {
      db.$client
        .prepare(
          `UPDATE identity_profile
           SET status = ?, traits = NULL, updated_at = ?
           WHERE profile_id = ?`,
        )
        .run(
          row.derivedCleanupStatus === 'complete' ? 'deleted' : 'deleting',
          redactedAt,
          row.profileId,
        )
    }
  }

  private captureRestoreLifecycle(operationId: string): RestoreLifecycleState | undefined {
    const operation = this.db
      .select()
      .from(schema.TBackupOperation)
      .where(eq(schema.TBackupOperation.id, operationId))
      .limit(1)
      .all()[0]
    if (operation === undefined) return undefined
    const installation = this.db
      .select()
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .limit(1)
      .all()[0]
    if (installation === undefined) throw new Error('Installation lifecycle state is missing')
    const reference = this.db
      .select()
      .from(schema.TBackupRestoreReference)
      .where(eq(schema.TBackupRestoreReference.operationId, operationId))
      .limit(1)
      .all()[0]
    const sourceOperation =
      reference === undefined
        ? undefined
        : this.db
            .select()
            .from(schema.TBackupOperation)
            .where(eq(schema.TBackupOperation.id, reference.restoreSourceBackupId))
            .limit(1)
            .all()[0]
    const safety = this.db
      .select()
      .from(schema.TBackupArtifact)
      .where(
        and(
          eq(schema.TBackupArtifact.operationId, operationId),
          eq(schema.TBackupArtifact.artifactType, 'pre_restore_sqlite'),
        ),
      )
      .limit(1)
      .all()[0]
    const cleanupStages = this.db
      .select()
      .from(schema.TBackupCleanupStage)
      .where(eq(schema.TBackupCleanupStage.operationId, operationId))
      .all()
    const sourceCleanupStages =
      sourceOperation === undefined
        ? []
        : this.db
            .select()
            .from(schema.TBackupCleanupStage)
            .where(eq(schema.TBackupCleanupStage.operationId, sourceOperation.id))
            .all()
    return {
      operation,
      installation,
      reference,
      safety,
      cleanupStages,
      sourceOperation,
      sourceCleanupStages,
    }
  }

  private restoreLifecycle(db: Db, state: RestoreLifecycleState, source: SourceManifest): void {
    db.delete(schema.TBackupOperation)
      .where(inArray(schema.TBackupOperation.status, ['creating', 'restoring']))
      .run()
    if (state.sourceOperation !== undefined) {
      const sourceOperation = {
        ...state.sourceOperation,
        status: 'available',
        phase: 'ready',
        progress: 1,
        checkpoint: 'structurally_ready',
        controlReadiness: 'ready',
        analyticsReadiness: 'ready',
        structuralReadiness: 'ready',
        cleanupPending: false,
        errorCode: null,
        completedAt: source.createdAt,
        updatedAt: source.createdAt,
        ownerToken: null,
      } satisfies typeof schema.TBackupOperation.$inferInsert
      db.insert(schema.TBackupOperation).values(sourceOperation).onConflictDoNothing().run()
      for (const stage of state.sourceCleanupStages) {
        db.insert(schema.TBackupCleanupStage).values(stage).onConflictDoNothing().run()
      }
    }
    db.insert(schema.TBackupArtifact)
      .values({
        id: source.id,
        operationId: source.operationId,
        artifactType: 'authoritative_sqlite',
        generationId: source.generationId,
        storageKey: source.storageKey,
        schemaVersion: source.schemaVersion,
        retentionBoundary: source.retentionBoundary,
        acceptanceSequence: source.acceptanceSequence,
        sizeBytes: source.sizeBytes,
        checksumAlgorithm: source.checksumAlgorithm,
        checksumValue: source.checksumValue,
        metadata:
          source.retentionManifest === null
            ? null
            : encodeRetentionManifest(source.retentionManifest),
        createdAt: source.createdAt,
      })
      .onConflictDoNothing()
      .run()
    db.insert(schema.TBackupOperation).values(state.operation).onConflictDoNothing().run()
    if (state.safety !== undefined) {
      db.insert(schema.TBackupArtifact).values(state.safety).onConflictDoNothing().run()
    }
    if (state.reference !== undefined) {
      db.insert(schema.TBackupRestoreReference).values(state.reference).onConflictDoNothing().run()
    }
    for (const stage of state.cleanupStages) {
      db.insert(schema.TBackupCleanupStage).values(stage).onConflictDoNothing().run()
    }
    db.update(schema.TInstallation)
      .set({
        status: state.installation.status,
        activeOperationId: state.installation.activeOperationId,
        activeOperationKind: state.installation.activeOperationKind,
        activeOperationPhase: state.installation.activeOperationPhase,
        activeOperationCheckpoint: state.installation.activeOperationCheckpoint,
        activeOperationProgress: state.installation.activeOperationProgress,
        activeOperationOwnerToken: state.installation.activeOperationOwnerToken,
        activeOperationLastSafeSequence: state.installation.activeOperationLastSafeSequence,
        activeOperationErrorCode: state.installation.activeOperationErrorCode,
        cleanupPending: state.installation.cleanupPending,
        derivedCleanupStatus: state.installation.derivedCleanupStatus,
        derivedCleanupStartedAt: state.installation.derivedCleanupStartedAt,
        derivedCleanupCompletedAt: state.installation.derivedCleanupCompletedAt,
        derivedCleanupErrorCode: state.installation.derivedCleanupErrorCode,
        backupCleanupStatus: state.installation.backupCleanupStatus,
        backupCleanupStartedAt: state.installation.backupCleanupStartedAt,
        backupCleanupCompletedAt: state.installation.backupCleanupCompletedAt,
        backupCleanupErrorCode: state.installation.backupCleanupErrorCode,
        updatedAt: state.installation.updatedAt,
      })
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .run()
  }
}

interface RestoreLifecycleState {
  readonly operation: typeof schema.TBackupOperation.$inferSelect
  readonly installation: typeof schema.TInstallation.$inferSelect
  readonly reference: typeof schema.TBackupRestoreReference.$inferSelect | undefined
  readonly safety: typeof schema.TBackupArtifact.$inferSelect | undefined
  readonly cleanupStages: readonly (typeof schema.TBackupCleanupStage.$inferSelect)[]
  readonly sourceOperation: typeof schema.TBackupOperation.$inferSelect | undefined
  readonly sourceCleanupStages: readonly (typeof schema.TBackupCleanupStage.$inferSelect)[]
}

interface SiteLifecycleState {
  readonly site: typeof schema.TSite.$inferSelect
  readonly operation: typeof schema.TSiteLifecycleOperation.$inferSelect | undefined
}

export function classifyStorageExhausted(error: unknown): boolean {
  const code = error instanceof Error && 'code' in error ? error.code : undefined
  if (code === 'ENOSPC' || code === 'SQLITE_FULL') return true
  if (typeof code === 'string' && code.startsWith('SQLITE_IOERR')) return true
  const message = error instanceof Error ? error.message : String(error)
  return /database or disk is full|disk full|out of space|ENOSPC/i.test(message)
}

function assertSafeOperationId(id: string): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id))
    throw new BackupIncompatibilityError('Backup operation id is invalid')
}

async function verifyArtifact(
  path: string,
  sizeBytes: number,
  checksumValue: string,
): Promise<void> {
  let artifactStats: Awaited<ReturnType<typeof stat>>
  try {
    artifactStats = await stat(path)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new InsufficientStorageError('Backup artifact is unavailable')
    }
    throw error
  }
  if (!artifactStats.isFile() || artifactStats.size !== sizeBytes) {
    throw new BackupIncompatibilityError('Backup artifact size is invalid')
  }
  const checksum = createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
  if (checksum !== checksumValue)
    throw new BackupIncompatibilityError('Backup artifact checksum is invalid')
}

function verifySqliteIntegrity(path: string, requireRetentionTable = false): void {
  const database = createDb({ path })
  try {
    const rows = database.$client.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string
    }>
    if (rows.length === 0 || rows.some((row) => row.integrity_check !== 'ok')) {
      throw new BackupIncompatibilityError('Backup SQLite integrity is invalid')
    }
    if (
      requireRetentionTable &&
      database.$client
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'retention_effective_cutoff'",
        )
        .get() === undefined
    ) {
      throw new BackupIncompatibilityError('Backup SQLite retention table is missing')
    }
  } finally {
    closeDb(database)
  }
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

interface TombstoneRow {
  readonly siteId: string
  readonly organizationId: string
  readonly hostname: string
  readonly purgeOperationId: string
  readonly purgedAt: number
  readonly createdAt: number
}

interface RedactionRow {
  readonly id: string
  readonly siteId: string
  readonly profileId: string
  readonly identifiedUserId: string
  readonly profileEpoch: number
  readonly reason: string
  readonly status: string
  readonly requestedAt: number
  readonly appliedAt: number | null
  readonly derivedCleanupStatus: string
  readonly backupCleanupStatus: string
  readonly derivedCleanupUpdatedAt: number | null
  readonly backupCleanupUpdatedAt: number | null
  readonly createdAt: number
  readonly updatedAt: number
}
