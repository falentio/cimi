import { createHash } from 'node:crypto'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { and, eq, inArray } from 'drizzle-orm'
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

export class BackupIncompatibilityError extends Error {}
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
    verifySqliteIntegrity(path)
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
        this.restoreTombstones(stagedDb, tombstones)
        this.restoreRedactions(stagedDb, redactions)
        if (lifecycle !== undefined) this.restoreLifecycle(stagedDb, lifecycle, input.source)
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
      db: this.db,
    })
    await this.analyticsRebuild({ operationId: input.operationId })
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
      await this.db.$client.backup(path)
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

  private restoreRedactions(db: Db, rows: readonly RedactionRow[]): void {
    const insert = db.$client.prepare(
      'INSERT OR REPLACE INTO identity_redaction (id, site_id, profile_id, identified_user_id, profile_epoch, reason, status, requested_at, applied_at, derived_cleanup_status, backup_cleanup_status, derived_cleanup_updated_at, backup_cleanup_updated_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const hasSite = db.$client.prepare('SELECT 1 FROM site WHERE id = ?')
    const hasProfile = db.$client.prepare('SELECT 1 FROM identity_profile WHERE profile_id = ?')
    const hasEpoch = db.$client.prepare(
      'SELECT 1 FROM identity_profile_epoch WHERE profile_id = ? AND epoch = ?',
    )
    for (const row of rows) {
      if (
        hasSite.get(row.siteId) === undefined ||
        hasProfile.get(row.profileId) === undefined ||
        hasEpoch.get(row.profileId, row.profileEpoch) === undefined
      ) {
        continue
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
        metadata: null,
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

function verifySqliteIntegrity(path: string): void {
  const database = createDb({ path })
  try {
    const rows = database.$client.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string
    }>
    if (rows.length === 0 || rows.some((row) => row.integrity_check !== 'ok')) {
      throw new BackupIncompatibilityError('Backup SQLite integrity is invalid')
    }
  } finally {
    closeDb(database)
  }
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
