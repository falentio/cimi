import { and, asc, eq, inArray, isNull, isNotNull, or, sql } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type {
  BackupErrorCode,
  BackupOperation,
  BackupOperationCheckpoint,
  BackupOperationPhase,
  BackupRestoreRepository,
  CleanupStage,
  FailedOperation,
  SafetyManifest,
  SourceManifest,
} from './repository.ts'

export interface BackupRestoreRepositoryDrizzleDependencies {
  readonly db: Db
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

const CHECKPOINT_RANK: Record<BackupOperationCheckpoint, number> = {
  none: 0,
  sqlite_captured: 1,
  sqlite_restored: 2,
  duckdb_rebuilt: 3,
  structurally_ready: 4,
}

const PHASE_RANK: Record<BackupOperationPhase, number> = {
  capturing_sqlite: 0,
  restoring_sqlite: 1,
  rebuilding_duckdb: 2,
  cleanup_pending: 3,
  ready: 4,
  failed: 5,
}

export class BackupRestoreRepositoryDrizzle implements BackupRestoreRepository {
  private readonly db: Db

  constructor({ db }: BackupRestoreRepositoryDrizzleDependencies) {
    this.db = db
  }

  async beginBackup(
    input: BackupRestoreRepository.BeginInput,
  ): Promise<Awaited<ReturnType<BackupRestoreRepository['beginBackup']>>> {
    return this.db.transaction((tx) => {
      const operation = beginTx(tx, { ...input, operationType: 'backup' })
      return operation?.operationType === 'backup' && operation.status === 'creating'
        ? operation
        : undefined
    })
  }

  async beginRestore(
    input: BackupRestoreRepository.BeginRestoreInput,
  ): Promise<Awaited<ReturnType<BackupRestoreRepository['beginRestore']>>> {
    return this.db.transaction((tx) => {
      const operation = beginTx(tx, { ...input, operationType: 'restore' })
      return operation?.operationType === 'restore' && operation.status === 'creating'
        ? operation
        : undefined
    })
  }

  async find(operationId: string): Promise<BackupOperation | undefined> {
    return this.findOperation(operationId)
  }

  async findActive(): Promise<BackupOperation | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TBackupOperation)
      .where(
        and(
          inArray(schema.TBackupOperation.operationType, ['backup', 'restore']),
          inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
        ),
      )
      .orderBy(asc(schema.TBackupOperation.createdAt), asc(schema.TBackupOperation.id))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : this.findOperation(row.id)
  }

  async findSourceManifest(backupId: string): Promise<SourceManifest | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TBackupOperation)
      .where(
        and(
          eq(schema.TBackupOperation.id, backupId),
          eq(schema.TBackupOperation.operationType, 'backup'),
          eq(schema.TBackupOperation.status, 'available'),
        ),
      )
      .limit(1)
    if (rows[0] === undefined) return undefined
    const artifact = await this.findArtifact(backupId, 'authoritative_sqlite')
    return artifact === undefined ? undefined : toSourceManifest(artifact)
  }

  async findAuthoritativeArtifact(operationId: string): Promise<SourceManifest | undefined> {
    const artifact = await this.findArtifact(operationId, 'authoritative_sqlite')
    return artifact === undefined ? undefined : toSourceManifest(artifact)
  }

  async findSafetyArtifact(operationId: string): Promise<SafetyManifest | undefined> {
    const artifact = await this.findArtifact(operationId, 'pre_restore_sqlite')
    if (artifact === undefined) return undefined
    return toSafetyManifest(artifact, artifact.acceptanceSequence ?? 0)
  }

  async findCleanupPending(): Promise<BackupOperation | undefined> {
    const rows = await this.db
      .select({ id: schema.TBackupOperation.id })
      .from(schema.TBackupOperation)
      .where(
        and(
          inArray(schema.TBackupOperation.operationType, ['backup', 'restore']),
          eq(schema.TBackupOperation.status, 'available'),
          eq(schema.TBackupOperation.cleanupPending, true),
        ),
      )
      .orderBy(asc(schema.TBackupOperation.updatedAt), asc(schema.TBackupOperation.id))
      .limit(1)
    return rows[0] === undefined ? undefined : this.findOperation(rows[0].id)
  }

  async list(input: BackupRestoreRepository.PageInput) {
    const [countRow, rows] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.operationType, 'backup')),
      this.db
        .select()
        .from(schema.TBackupOperation)
        .where(eq(schema.TBackupOperation.operationType, 'backup'))
        .orderBy(asc(schema.TBackupOperation.createdAt), asc(schema.TBackupOperation.id))
        .limit(input.limit)
        .offset(input.offset),
    ])
    const items = await Promise.all(rows.map((row) => this.findOperation(row.id)))
    const operations = items.filter(
      (operation): operation is BackupOperation => operation !== undefined,
    )
    const totalCount = Number(countRow[0]?.count ?? 0)
    const nextOffset =
      input.offset + operations.length < totalCount ? input.offset + operations.length : null
    return {
      items: operations,
      nextOffset,
      hasMore: nextOffset !== null,
      totalCount,
    }
  }

  async claim(input: BackupRestoreRepository.ClaimInput): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectOperation(tx, input.operationId)
      if (
        operation === undefined ||
        (operation.operationType !== 'backup' && operation.operationType !== 'restore') ||
        (operation.status !== 'creating' && operation.status !== 'restoring') ||
        operation.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      ) {
        return undefined
      }
      const installation = selectInstallation(tx)
      if (
        installation === undefined ||
        installation.activeOperationId !== input.operationId ||
        installation.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      ) {
        return undefined
      }
      const updated = tx
        .update(schema.TBackupOperation)
        .set({ ownerToken: input.ownerToken, updatedAt: input.now })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.updatedAt, input.expectedUpdatedAt),
            inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
          ),
        )
        .run()
      if (updated.changes !== 1) return undefined
      const installationUpdated = tx
        .update(schema.TInstallation)
        .set({
          status: operation.operationType === 'restore' ? 'recovering' : 'maintenance',
          activeOperationOwnerToken: input.ownerToken,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TInstallation.singletonKey, 'default'),
            eq(schema.TInstallation.activeOperationId, input.operationId),
            eq(schema.TInstallation.updatedAt, input.expectedUpdatedAt),
          ),
        )
        .run()
      if (installationUpdated.changes !== 1) throw new Error('Backup operation claim was lost')
      return toOperation(tx, input.operationId)
    })
  }

  async recordBackupArtifact(
    input: BackupRestoreRepository.RecordBackupArtifactInput,
  ): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectOwnedActiveOperation(tx, input.operationId, input.ownerToken)
      if (operation === undefined || operation.operationType !== 'backup') return undefined
      const existing = selectArtifact(tx, input.operationId, 'authoritative_sqlite')
      if (existing === undefined) {
        tx.insert(schema.TBackupArtifact)
          .values({
            id: input.artifact.id,
            operationId: input.operationId,
            artifactType: 'authoritative_sqlite',
            generationId: input.artifact.generationId,
            storageKey: input.artifact.storageKey,
            schemaVersion: input.artifact.schemaVersion,
            retentionBoundary: input.artifact.retentionBoundary,
            acceptanceSequence: input.artifact.acceptanceSequence,
            sizeBytes: input.artifact.sizeBytes,
            checksumAlgorithm: input.artifact.checksumAlgorithm,
            checksumValue: input.artifact.checksumValue,
            metadata: null,
            createdAt: input.artifact.createdAt,
          })
          .run()
      }
      return advanceTx(tx, {
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        phase: 'capturing_sqlite',
        checkpoint: 'sqlite_captured',
        progress: Math.max(operation.progress, 0.9),
        lastSafeSequence: operation.lastSafeSequence,
        now: input.now,
      })
    })
  }

  async recordSafetyArtifact(
    input: BackupRestoreRepository.RecordSafetyArtifactInput,
  ): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectOwnedActiveOperation(tx, input.operationId, input.ownerToken)
      if (operation === undefined || operation.operationType !== 'restore') return undefined
      const reference = tx
        .select()
        .from(schema.TBackupRestoreReference)
        .where(eq(schema.TBackupRestoreReference.operationId, input.operationId))
        .limit(1)
        .all()[0]
      if (reference === undefined) return undefined
      const existing = selectArtifact(tx, input.operationId, 'pre_restore_sqlite')
      if (existing === undefined) {
        tx.insert(schema.TBackupArtifact)
          .values({
            id: input.artifact.id,
            operationId: input.operationId,
            artifactType: 'pre_restore_sqlite',
            generationId: input.artifact.generationId,
            storageKey: input.artifact.storageKey,
            schemaVersion: input.artifact.schemaVersion,
            retentionBoundary: null,
            acceptanceSequence: input.artifact.lastSafeSequence,
            sizeBytes: input.artifact.sizeBytes,
            checksumAlgorithm: input.artifact.checksumAlgorithm,
            checksumValue: input.artifact.checksumValue,
            metadata: null,
            createdAt: input.artifact.createdAt,
          })
          .run()
      }
      if (reference.preRestoreSafetyArtifactId === null) {
        tx.update(schema.TBackupRestoreReference)
          .set({ preRestoreSafetyArtifactId: input.artifact.id })
          .where(eq(schema.TBackupRestoreReference.operationId, input.operationId))
          .run()
      } else if (reference.preRestoreSafetyArtifactId !== input.artifact.id) {
        return undefined
      }
      const updated = tx
        .update(schema.TBackupOperation)
        .set({
          status: 'restoring',
          phase: 'restoring_sqlite',
          startedAt: operation.startedAt ?? input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
            eq(schema.TBackupOperation.status, 'creating'),
          ),
        )
        .run()
      if (updated.changes !== 1) return undefined
      projectInstallation(tx, {
        operationId: input.operationId,
        phase: 'restoring_sqlite',
        checkpoint: operation.checkpoint,
        progress: Math.max(operation.progress, 0.25),
        lastSafeSequence: operation.lastSafeSequence,
        now: input.now,
        status: 'recovering',
        ownerToken: input.ownerToken,
        errorCode: null,
      })
      return toOperation(tx, input.operationId)
    })
  }

  async advance(input: BackupRestoreRepository.AdvanceInput): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => advanceTx(tx, input))
  }

  async complete(
    input: BackupRestoreRepository.CompleteInput,
  ): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectOwnedActiveOperation(tx, input.operationId, input.ownerToken)
      if (operation === undefined) return undefined
      if (
        operation.operationType === 'backup' &&
        selectArtifact(tx, input.operationId, 'authoritative_sqlite') === undefined
      ) {
        return undefined
      }
      if (
        operation.operationType === 'restore' &&
        (operation.checkpoint !== 'structurally_ready' ||
          selectArtifact(tx, input.operationId, 'pre_restore_sqlite') === undefined)
      ) {
        return undefined
      }
      let stages = selectCleanupStages(tx, input.operationId)
      if (
        operation.operationType === 'restore' &&
        stages.derived.status === 'not_applicable' &&
        stages.backup.status === 'not_applicable'
      ) {
        tx.update(schema.TBackupCleanupStage)
          .set({ status: 'pending' })
          .where(eq(schema.TBackupCleanupStage.operationId, input.operationId))
          .run()
        stages = selectCleanupStages(tx, input.operationId)
      }
      const cleanupPending =
        isCleanupPending(stages.derived.status) || isCleanupPending(stages.backup.status)
      const phase = cleanupPending ? 'cleanup_pending' : 'ready'
      const updatedOperation = tx
        .update(schema.TBackupOperation)
        .set({
          status: 'available',
          phase,
          progress: 1,
          checkpoint: 'structurally_ready',
          controlReadiness: 'ready',
          analyticsReadiness: 'ready',
          structuralReadiness: 'ready',
          cleanupPending,
          completedAt: input.now,
          updatedAt: input.now,
          ownerToken: null,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
            inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
          ),
        )
        .run()
      if (updatedOperation.changes !== 1) return undefined
      const installationUpdated = tx
        .update(schema.TInstallation)
        .set({
          status: 'ready',
          activeOperationId: null,
          activeOperationKind: null,
          activeOperationPhase: null,
          activeOperationCheckpoint: null,
          activeOperationProgress: null,
          activeOperationOwnerToken: null,
          activeOperationLastSafeSequence: null,
          activeOperationErrorCode: null,
          cleanupPending,
          derivedCleanupStatus: stages.derived.status,
          derivedCleanupStartedAt: stages.derived.startedAt,
          derivedCleanupCompletedAt: stages.derived.completedAt,
          derivedCleanupErrorCode: stages.derived.errorCode,
          backupCleanupStatus: stages.backup.status,
          backupCleanupStartedAt: stages.backup.startedAt,
          backupCleanupCompletedAt: stages.backup.completedAt,
          backupCleanupErrorCode: stages.backup.errorCode,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TInstallation.singletonKey, 'default'),
            eq(schema.TInstallation.activeOperationId, input.operationId),
            eq(schema.TInstallation.activeOperationOwnerToken, input.ownerToken),
          ),
        )
        .run()
      if (installationUpdated.changes !== 1) throw new Error('Backup completion was lost')
      return toOperation(tx, input.operationId)
    })
  }

  async fail(input: BackupRestoreRepository.FailInput): Promise<BackupOperation | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectOwnedActiveOperation(tx, input.operationId, input.ownerToken)
      if (operation === undefined) return undefined
      if (input.recoveryRequired === true) {
        tx.update(schema.TBackupOperation)
          .set({
            status: 'failed',
            phase: 'failed',
            errorCode: input.errorCode,
            completedAt: input.now,
            ownerToken: null,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(schema.TBackupOperation.id, input.operationId),
              eq(schema.TBackupOperation.ownerToken, input.ownerToken),
              inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
            ),
          )
          .run()
        tx.update(schema.TInstallation)
          .set({
            status: 'recovering',
            activeOperationPhase: 'lifecycle_transition',
            activeOperationCheckpoint: toInstallationCheckpoint(operation.checkpoint),
            activeOperationProgress: operation.progress,
            activeOperationOwnerToken: null,
            activeOperationLastSafeSequence: operation.lastSafeSequence,
            activeOperationErrorCode: input.errorCode,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(schema.TInstallation.singletonKey, 'default'),
              eq(schema.TInstallation.activeOperationId, input.operationId),
              eq(schema.TInstallation.activeOperationOwnerToken, input.ownerToken),
            ),
          )
          .run()
        return toOperation(tx, input.operationId)
      }
      const updatedOperation = tx
        .update(schema.TBackupOperation)
        .set({
          status: 'failed',
          phase: 'failed',
          errorCode: input.errorCode,
          completedAt: input.now,
          updatedAt: input.now,
          ownerToken: null,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
            inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
          ),
        )
        .run()
      if (updatedOperation.changes !== 1) return undefined
      const installationUpdated = tx
        .update(schema.TInstallation)
        .set({
          status: 'degraded',
          activeOperationPhase: 'lifecycle_transition',
          activeOperationCheckpoint: toInstallationCheckpoint(operation.checkpoint),
          activeOperationProgress: operation.progress,
          activeOperationOwnerToken: null,
          activeOperationLastSafeSequence: operation.lastSafeSequence,
          activeOperationErrorCode: input.errorCode,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TInstallation.singletonKey, 'default'),
            eq(schema.TInstallation.activeOperationId, input.operationId),
            eq(schema.TInstallation.activeOperationOwnerToken, input.ownerToken),
          ),
        )
        .run()
      if (installationUpdated.changes !== 1) throw new Error('Backup failure recording was lost')
      return toOperation(tx, input.operationId)
    })
  }

  async claimCleanupStage(
    input: BackupRestoreRepository.ClaimCleanupStageInput,
  ): Promise<BackupRestoreRepository.CleanupWork | undefined> {
    return this.db.transaction((tx) => {
      const operation = tx
        .select()
        .from(schema.TBackupOperation)
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.status, 'available'),
          ),
        )
        .limit(1)
        .all()[0]
      const stage = tx
        .select()
        .from(schema.TBackupCleanupStage)
        .where(
          and(
            eq(schema.TBackupCleanupStage.operationId, input.operationId),
            eq(schema.TBackupCleanupStage.stage, input.stage),
          ),
        )
        .limit(1)
        .all()[0]
      if (
        operation === undefined ||
        stage === undefined ||
        !isClaimableCleanupStage(stage.status)
      ) {
        return undefined
      }
      if (input.stage === 'backup_cleanup') {
        const derived = tx
          .select({ status: schema.TBackupCleanupStage.status })
          .from(schema.TBackupCleanupStage)
          .where(
            and(
              eq(schema.TBackupCleanupStage.operationId, input.operationId),
              eq(schema.TBackupCleanupStage.stage, 'derived_cleanup'),
            ),
          )
          .limit(1)
          .all()[0]
        if (derived?.status !== 'completed') return undefined
      }
      if (operation.ownerToken !== null) return undefined
      const operationUpdated = tx
        .update(schema.TBackupOperation)
        .set({ ownerToken: input.ownerToken, updatedAt: input.now })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            isNull(schema.TBackupOperation.ownerToken),
          ),
        )
        .run()
      if (operationUpdated.changes !== 1) return undefined
      const stageUpdated = tx
        .update(schema.TBackupCleanupStage)
        .set({
          status: 'running',
          startedAt: stage.startedAt ?? input.now,
          completedAt: null,
          errorCode: null,
        })
        .where(
          and(
            eq(schema.TBackupCleanupStage.operationId, input.operationId),
            eq(schema.TBackupCleanupStage.stage, input.stage),
            eq(schema.TBackupCleanupStage.status, stage.status),
          ),
        )
        .run()
      if (stageUpdated.changes !== 1) throw new Error('Backup cleanup claim was lost')
      return { operationId: input.operationId, stage: input.stage }
    })
  }

  async completeCleanupStage(
    input: BackupRestoreRepository.CompleteCleanupStageInput,
  ): Promise<void> {
    await this.finishCleanupStage(input, null)
  }

  async failCleanupStage(input: BackupRestoreRepository.FailCleanupStageInput): Promise<void> {
    await this.finishCleanupStage(input, input.errorCode)
  }

  private async finishCleanupStage(
    input: BackupRestoreRepository.CompleteCleanupStageInput,
    errorCode: BackupErrorCode | null,
  ): Promise<void> {
    this.db.transaction((tx) => {
      const operation = selectOperation(tx, input.operationId)
      if (
        operation === undefined ||
        operation.status !== 'available' ||
        operation.ownerToken !== input.ownerToken
      ) {
        throw new Error('Backup cleanup ownership was lost')
      }
      if (input.stage === 'backup_cleanup') {
        const derived = tx
          .select({ status: schema.TBackupCleanupStage.status })
          .from(schema.TBackupCleanupStage)
          .where(
            and(
              eq(schema.TBackupCleanupStage.operationId, input.operationId),
              eq(schema.TBackupCleanupStage.stage, 'derived_cleanup'),
            ),
          )
          .limit(1)
          .all()[0]
        if (derived?.status !== 'completed') throw new Error('Derived cleanup must complete first')
      }
      const updatedStage = tx
        .update(schema.TBackupCleanupStage)
        .set({
          status: errorCode === null ? 'completed' : 'failed',
          completedAt: input.now,
          errorCode,
        })
        .where(
          and(
            eq(schema.TBackupCleanupStage.operationId, input.operationId),
            eq(schema.TBackupCleanupStage.stage, input.stage),
            eq(schema.TBackupCleanupStage.status, 'running'),
          ),
        )
        .run()
      if (updatedStage.changes !== 1) return
      const stages = selectCleanupStages(tx, input.operationId)
      const cleanupPending =
        isCleanupPending(stages.derived.status) || isCleanupPending(stages.backup.status)
      const operationUpdated = tx
        .update(schema.TBackupOperation)
        .set({
          ownerToken: null,
          cleanupPending,
          phase: cleanupPending ? 'cleanup_pending' : 'ready',
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
          ),
        )
        .run()
      if (operationUpdated.changes !== 1) throw new Error('Backup cleanup ownership was lost')
      tx.update(schema.TInstallation)
        .set({
          cleanupPending,
          derivedCleanupStatus: stages.derived.status,
          derivedCleanupStartedAt: stages.derived.startedAt,
          derivedCleanupCompletedAt: stages.derived.completedAt,
          derivedCleanupErrorCode: stages.derived.errorCode,
          backupCleanupStatus: stages.backup.status,
          backupCleanupStartedAt: stages.backup.startedAt,
          backupCleanupCompletedAt: stages.backup.completedAt,
          backupCleanupErrorCode: stages.backup.errorCode,
          updatedAt: input.now,
        })
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .run()
    })
  }

  private async findOperation(operationId: string): Promise<BackupOperation | undefined> {
    const operationRows = await this.db
      .select()
      .from(schema.TBackupOperation)
      .where(
        and(
          eq(schema.TBackupOperation.id, operationId),
          inArray(schema.TBackupOperation.operationType, ['backup', 'restore']),
        ),
      )
      .limit(1)
    if (operationRows[0] === undefined) return undefined
    const artifacts = await this.db
      .select()
      .from(schema.TBackupArtifact)
      .where(eq(schema.TBackupArtifact.operationId, operationId))
    const reference = (
      await this.db
        .select()
        .from(schema.TBackupRestoreReference)
        .where(eq(schema.TBackupRestoreReference.operationId, operationId))
        .limit(1)
    )[0]
    const stages = await this.db
      .select()
      .from(schema.TBackupCleanupStage)
      .where(eq(schema.TBackupCleanupStage.operationId, operationId))
    return toOperationFromRows(
      operationRows[0],
      artifacts,
      reference,
      cleanupStagesFromRows(stages),
    )
  }

  private async findArtifact(
    operationId: string,
    artifactType: 'authoritative_sqlite' | 'pre_restore_sqlite',
  ): Promise<typeof schema.TBackupArtifact.$inferSelect | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TBackupArtifact)
      .where(
        and(
          eq(schema.TBackupArtifact.operationId, operationId),
          eq(schema.TBackupArtifact.artifactType, artifactType),
        ),
      )
      .limit(1)
    const artifact = rows[0]
    if (artifact === undefined) return undefined
    return artifact
  }
}

function beginTx(
  tx: SqliteTransaction,
  input:
    | (BackupRestoreRepository.BeginInput & { readonly operationType: 'backup' })
    | (BackupRestoreRepository.BeginRestoreInput & { readonly operationType: 'restore' }),
): BackupOperation | undefined {
  const installation = selectInstallation(tx)
  if (
    installation === undefined ||
    (installation.status !== 'ready' && installation.status !== 'degraded') ||
    (installation.activeOperationId !== null && installation.activeOperationErrorCode === null)
  ) {
    return undefined
  }
  if (input.operationType === 'restore') {
    if (!hasAvailableBackup(tx, input.sourceBackupId)) return undefined
  }
  const inserted = tx
    .update(schema.TInstallation)
    .set({
      status: 'maintenance',
      activeOperationId: input.operationId,
      activeOperationKind: input.operationType,
      activeOperationPhase: 'lifecycle_transition',
      activeOperationCheckpoint: 'none',
      activeOperationProgress: 0,
      activeOperationOwnerToken: input.ownerToken,
      activeOperationLastSafeSequence: null,
      activeOperationErrorCode: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.TInstallation.singletonKey, 'default'),
        inArray(schema.TInstallation.status, ['ready', 'degraded']),
        orNullOrTerminalActiveOperation(),
      ),
    )
    .run()
  if (inserted.changes !== 1) return undefined
  tx.insert(schema.TBackupOperation)
    .values({
      id: input.operationId,
      operationType: input.operationType,
      status: 'creating',
      scope: 'installation',
      phase: 'capturing_sqlite',
      progress: 0,
      checkpoint: 'none',
      lastSafeSequence: null,
      controlReadiness: 'ready',
      analyticsReadiness: 'ready',
      structuralReadiness: 'not_ready',
      cleanupPending: false,
      errorCode: null,
      recoveryKey: null,
      createdAt: input.now,
      startedAt: null,
      completedAt: null,
      updatedAt: input.now,
      ownerToken: input.ownerToken,
    })
    .run()
  if (input.operationType === 'restore') {
    const sourceBackupId = input.sourceBackupId
    tx.insert(schema.TBackupRestoreReference)
      .values({
        operationId: input.operationId,
        restoreSourceBackupId: sourceBackupId,
        preRestoreSafetyArtifactId: null,
        createdAt: input.now,
      })
      .run()
  }
  tx.insert(schema.TBackupCleanupStage)
    .values({
      operationId: input.operationId,
      stage: 'derived_cleanup',
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    })
    .run()
  tx.insert(schema.TBackupCleanupStage)
    .values({
      operationId: input.operationId,
      stage: 'backup_cleanup',
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    })
    .run()
  return toOperation(tx, input.operationId)
}

function advanceTx(
  tx: SqliteTransaction,
  input: BackupRestoreRepository.AdvanceInput,
): BackupOperation | undefined {
  const operation = selectOwnedActiveOperation(tx, input.operationId, input.ownerToken)
  if (operation === undefined) return undefined
  if (
    PHASE_RANK[input.phase] < PHASE_RANK[operation.phase] ||
    CHECKPOINT_RANK[input.checkpoint] < CHECKPOINT_RANK[operation.checkpoint] ||
    input.progress < operation.progress ||
    (operation.lastSafeSequence !== null &&
      (input.lastSafeSequence === null || input.lastSafeSequence < operation.lastSafeSequence)) ||
    input.now.getTime() < operation.updatedAt.getTime()
  ) {
    return undefined
  }
  const readiness = readinessForAdvance(operation, input)
  const updated = tx
    .update(schema.TBackupOperation)
    .set({
      phase: input.phase,
      checkpoint: input.checkpoint,
      progress: input.progress,
      lastSafeSequence: input.lastSafeSequence,
      controlReadiness: readiness.controlStore,
      analyticsReadiness: readiness.analyticsStore,
      structuralReadiness: readiness.structural,
      startedAt: operation.startedAt ?? input.now,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.TBackupOperation.id, input.operationId),
        eq(schema.TBackupOperation.ownerToken, input.ownerToken),
        inArray(schema.TBackupOperation.status, ['creating', 'restoring']),
      ),
    )
    .run()
  if (updated.changes !== 1) return undefined
  projectInstallation(tx, {
    operationId: input.operationId,
    phase: input.phase,
    checkpoint: input.checkpoint,
    progress: input.progress,
    lastSafeSequence: input.lastSafeSequence,
    now: input.now,
    status: operation.operationType === 'restore' ? 'recovering' : 'maintenance',
    ownerToken: input.ownerToken,
    errorCode: null,
  })
  return toOperation(tx, input.operationId)
}

function readinessForAdvance(
  operation: typeof schema.TBackupOperation.$inferSelect,
  input: BackupRestoreRepository.AdvanceInput,
): {
  readonly controlStore: 'not_ready' | 'ready'
  readonly analyticsStore: 'not_ready' | 'ready' | 'rebuilding'
  readonly structural: 'not_ready' | 'ready'
} {
  if (operation.operationType === 'backup') {
    return {
      controlStore: operation.controlReadiness,
      analyticsStore: operation.analyticsReadiness,
      structural: operation.structuralReadiness,
    }
  }
  if (input.phase === 'rebuilding_duckdb' && input.checkpoint === 'sqlite_restored') {
    return { controlStore: 'ready', analyticsStore: 'rebuilding', structural: 'not_ready' }
  }
  if (input.checkpoint === 'duckdb_rebuilt') {
    return { controlStore: 'ready', analyticsStore: 'ready', structural: 'not_ready' }
  }
  if (input.checkpoint === 'structurally_ready') {
    return { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' }
  }
  return { controlStore: 'not_ready', analyticsStore: 'not_ready', structural: 'not_ready' }
}

function projectInstallation(
  tx: SqliteTransaction,
  input: {
    readonly operationId: string
    readonly phase: BackupOperationPhase
    readonly checkpoint: BackupOperationCheckpoint
    readonly progress: number
    readonly lastSafeSequence: number | null
    readonly now: Date
    readonly status: 'maintenance' | 'recovering'
    readonly ownerToken: string
    readonly errorCode: BackupErrorCode | null
  },
): void {
  const updated = tx
    .update(schema.TInstallation)
    .set({
      status: input.status,
      activeOperationPhase: 'lifecycle_transition',
      activeOperationCheckpoint: toInstallationCheckpoint(input.checkpoint),
      activeOperationProgress: input.progress,
      activeOperationOwnerToken: input.ownerToken,
      activeOperationLastSafeSequence: input.lastSafeSequence,
      activeOperationErrorCode: input.errorCode,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.TInstallation.singletonKey, 'default'),
        eq(schema.TInstallation.activeOperationId, input.operationId),
        eq(schema.TInstallation.activeOperationOwnerToken, input.ownerToken),
      ),
    )
    .run()
  if (updated.changes !== 1) throw new Error(`Backup ${input.phase} projection was lost`)
}

function selectOperation(tx: SqliteTransaction, operationId: string) {
  return tx
    .select()
    .from(schema.TBackupOperation)
    .where(
      and(
        eq(schema.TBackupOperation.id, operationId),
        inArray(schema.TBackupOperation.operationType, ['backup', 'restore']),
      ),
    )
    .limit(1)
    .all()[0]
}

function selectOwnedActiveOperation(
  tx: SqliteTransaction,
  operationId: string,
  ownerToken: string,
) {
  const operation = selectOperation(tx, operationId)
  if (
    operation === undefined ||
    operation.ownerToken !== ownerToken ||
    (operation.status !== 'creating' && operation.status !== 'restoring')
  ) {
    return undefined
  }
  return operation
}

function selectInstallation(tx: SqliteTransaction) {
  return tx
    .select()
    .from(schema.TInstallation)
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .limit(1)
    .all()[0]
}

function hasAvailableBackup(tx: SqliteTransaction, operationId: string): boolean {
  const operation = tx
    .select({ id: schema.TBackupOperation.id })
    .from(schema.TBackupOperation)
    .where(
      and(
        eq(schema.TBackupOperation.id, operationId),
        eq(schema.TBackupOperation.operationType, 'backup'),
        eq(schema.TBackupOperation.status, 'available'),
      ),
    )
    .limit(1)
    .all()[0]
  if (operation === undefined) return false
  return selectArtifact(tx, operationId, 'authoritative_sqlite') !== undefined
}

function selectArtifact(
  tx: SqliteTransaction,
  operationId: string,
  artifactType: 'authoritative_sqlite' | 'pre_restore_sqlite',
) {
  return tx
    .select()
    .from(schema.TBackupArtifact)
    .where(
      and(
        eq(schema.TBackupArtifact.operationId, operationId),
        eq(schema.TBackupArtifact.artifactType, artifactType),
      ),
    )
    .limit(1)
    .all()[0]
}

function selectCleanupStages(
  tx: SqliteTransaction,
  operationId: string,
): {
  readonly derived: CleanupStage
  readonly backup: CleanupStage
} {
  const stages = tx
    .select()
    .from(schema.TBackupCleanupStage)
    .where(eq(schema.TBackupCleanupStage.operationId, operationId))
    .all()
  const derived = stages.find((stage) => stage.stage === 'derived_cleanup')
  const backup = stages.find((stage) => stage.stage === 'backup_cleanup')
  if (derived === undefined || backup === undefined)
    throw new Error('Backup cleanup stages are incomplete')
  return { derived: toCleanupStage(derived), backup: toCleanupStage(backup) }
}

function cleanupStagesFromRows(rows: readonly (typeof schema.TBackupCleanupStage.$inferSelect)[]): {
  readonly derived: CleanupStage
  readonly backup: CleanupStage
} {
  const derived = rows.find((stage) => stage.stage === 'derived_cleanup')
  const backup = rows.find((stage) => stage.stage === 'backup_cleanup')
  if (derived === undefined || backup === undefined)
    throw new Error('Backup cleanup stages are incomplete')
  return { derived: toCleanupStage(derived), backup: toCleanupStage(backup) }
}

function toOperation(tx: SqliteTransaction, operationId: string): BackupOperation {
  const operation = selectOperation(tx, operationId)
  if (operation === undefined) throw new Error('Backup operation was not found')
  const artifacts = tx
    .select()
    .from(schema.TBackupArtifact)
    .where(eq(schema.TBackupArtifact.operationId, operationId))
    .all()
  const reference = tx
    .select()
    .from(schema.TBackupRestoreReference)
    .where(eq(schema.TBackupRestoreReference.operationId, operationId))
    .limit(1)
    .all()[0]
  const stages = selectCleanupStages(tx, operationId)
  return toOperationFromRows(operation, artifacts, reference, stages)
}

function toOperationFromRows(
  row: typeof schema.TBackupOperation.$inferSelect,
  artifacts: readonly (typeof schema.TBackupArtifact.$inferSelect)[],
  reference: typeof schema.TBackupRestoreReference.$inferSelect | undefined,
  cleanupStages: { readonly derived: CleanupStage; readonly backup: CleanupStage },
): BackupOperation {
  if (row.operationType !== 'backup' && row.operationType !== 'restore') {
    throw new Error('Unexpected operation type in backup repository')
  }
  const cleanup = {
    derivedCleanup: cleanupStages.derived,
    backupCleanup: cleanupStages.backup,
  }
  const common = {
    id: row.id,
    scope: 'installation' as const,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    progress: row.progress,
    checkpoint: row.checkpoint,
    lastSafeSequence: row.lastSafeSequence,
    readiness: {
      controlStore: row.controlReadiness,
      analyticsStore: row.analyticsReadiness,
      structural: row.structuralReadiness,
    },
    cleanupPending: row.cleanupPending,
    derivedCleanup: cleanup.derivedCleanup,
    backupCleanup: cleanup.backupCleanup,
  }
  const safetyArtifact = artifacts.find(
    (artifact) => artifact.artifactType === 'pre_restore_sqlite',
  )
  const safety =
    safetyArtifact === undefined
      ? null
      : toSafetyManifest(
          safetyArtifact,
          safetyArtifact.acceptanceSequence ?? row.lastSafeSequence ?? 0,
        )
  const sourceId = reference?.restoreSourceBackupId ?? null
  if (row.status === 'creating') {
    if (row.operationType === 'restore') {
      if (sourceId === null) throw new Error('Restore operation has no source reference')
      return {
        ...common,
        operationType: 'restore',
        status: 'creating',
        phase: 'capturing_sqlite',
        completedAt: null,
        restoreSourceBackupId: sourceId,
        preRestoreSafetyArtifact: null,
        errorCode: null,
      }
    }
    return {
      ...common,
      operationType: 'backup',
      status: 'creating',
      phase: 'capturing_sqlite',
      completedAt: null,
      restoreSourceBackupId: null,
      preRestoreSafetyArtifact: null,
      errorCode: null,
    }
  }
  if (row.status === 'restoring') {
    if (row.operationType !== 'restore' || sourceId === null || safety === null) {
      throw new Error('Restoring operation is missing owned restore state')
    }
    const phase = row.phase === 'capturing_sqlite' ? 'restoring_sqlite' : row.phase
    if (phase === 'failed') throw new Error('Restoring operation has a failed phase')
    return {
      ...common,
      operationType: 'restore',
      status: 'restoring',
      phase,
      completedAt: null,
      restoreSourceBackupId: sourceId,
      preRestoreSafetyArtifact: safety,
      errorCode: null,
    }
  }
  if (row.status === 'available') {
    return {
      ...common,
      operationType: row.operationType,
      status: 'available',
      phase: row.phase === 'cleanup_pending' ? 'cleanup_pending' : 'ready',
      completedAt: row.completedAt ?? row.updatedAt,
      restoreSourceBackupId: sourceId,
      preRestoreSafetyArtifact: safety,
      errorCode: null,
    }
  }
  if (row.completedAt === null || row.errorCode === null)
    throw new Error('Failed backup operation is incomplete')
  const failed: FailedOperation = {
    ...common,
    operationType: row.operationType,
    status: 'failed',
    phase: 'failed',
    completedAt: row.completedAt,
    restoreSourceBackupId: sourceId,
    preRestoreSafetyArtifact: safety,
    errorCode: row.errorCode,
  }
  return failed
}

function toSourceManifest(row: typeof schema.TBackupArtifact.$inferSelect): SourceManifest {
  if (row.artifactType !== 'authoritative_sqlite' || row.checksumAlgorithm !== 'sha256') {
    throw new Error('Source artifact is invalid')
  }
  return {
    kind: 'source',
    id: row.id,
    operationId: row.operationId,
    artifactType: 'authoritative_sqlite',
    generationId: row.generationId,
    storageKey: row.storageKey,
    schemaVersion: row.schemaVersion,
    retentionBoundary: row.retentionBoundary,
    acceptanceSequence: row.acceptanceSequence,
    sizeBytes: row.sizeBytes,
    checksumAlgorithm: 'sha256',
    checksumValue: row.checksumValue,
    createdAt: row.createdAt,
  }
}

function toSafetyManifest(
  row: typeof schema.TBackupArtifact.$inferSelect,
  lastSafeSequence: number,
): SafetyManifest {
  if (row.artifactType !== 'pre_restore_sqlite' || row.checksumAlgorithm !== 'sha256') {
    throw new Error('Safety artifact is invalid')
  }
  return {
    kind: 'safety',
    id: row.id,
    operationId: row.operationId,
    artifactType: 'pre_restore_sqlite',
    generationId: row.generationId,
    storageKey: row.storageKey,
    schemaVersion: row.schemaVersion,
    sizeBytes: row.sizeBytes,
    checksumAlgorithm: 'sha256',
    checksumValue: row.checksumValue,
    createdAt: row.createdAt,
    lastSafeSequence,
    status: 'ready',
    errorCode: null,
  }
}

function toCleanupStage(row: typeof schema.TBackupCleanupStage.$inferSelect): CleanupStage {
  return {
    status: row.status,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
  }
}

function isCleanupPending(status: CleanupStage['status']): boolean {
  return status !== 'not_applicable' && status !== 'completed'
}

function isClaimableCleanupStage(status: CleanupStage['status']): boolean {
  return (
    status === 'not_started' || status === 'pending' || status === 'running' || status === 'failed'
  )
}

function toInstallationCheckpoint(
  checkpoint: BackupOperationCheckpoint,
): 'none' | 'sqlite_captured' | 'duckdb_rebuilt' | 'structurally_ready' {
  if (checkpoint === 'sqlite_restored') return 'sqlite_captured'
  return checkpoint
}

function orNullOrTerminalActiveOperation() {
  return or(
    isNull(schema.TInstallation.activeOperationId),
    isNotNull(schema.TInstallation.activeOperationErrorCode),
  )
}
