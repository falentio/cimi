import * as v from 'valibot'
import { and, eq, isNull } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import type { InstallationRepository } from './repository.ts'

export interface InstallationRepositoryDrizzleDependencies {
  db: Db
}

export class InstallationRepositoryDrizzle implements InstallationRepository {
  private readonly db: Db

  constructor({ db }: InstallationRepositoryDrizzleDependencies) {
    this.db = db
  }

  async find(): Promise<InstallationRepository.Record | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .limit(1)
    const row = rows[0]
    if (row === undefined) return undefined
    const policy = await this.findActiveRetention(row.id)
    return toRecord(row, policy)
  }

  async insert(input: InstallationRepository.CreateInput): Promise<InstallationRepository.Record> {
    return this.db.transaction((tx) => {
      tx.insert(schema.TInstallation)
        .values({
          id: input.id,
          singletonKey: 'default',
          status: 'ready',
          eventRetentionMonths: input.eventMonths,
          profileRetentionMonths: input.profileMonths,
          replayRetentionMonths: input.replayMonths,
          dataDirectoryReady: input.dataDirectoryReady,
          activeOperationId: null,
          activeOperationKind: null,
          activeOperationPhase: null,
          activeOperationCheckpoint: null,
          activeOperationProgress: null,
          activeOperationOwnerToken: null,
          activeOperationLastSafeSequence: null,
          activeOperationErrorCode: null,
          cleanupPending: false,
          derivedCleanupStatus: 'not_applicable',
          derivedCleanupStartedAt: null,
          derivedCleanupCompletedAt: null,
          derivedCleanupErrorCode: null,
          backupCleanupStatus: 'not_applicable',
          backupCleanupStartedAt: null,
          backupCleanupCompletedAt: null,
          backupCleanupErrorCode: null,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .run()
      tx.insert(schema.TRetentionPolicy)
        .values({
          id: input.retentionPolicyId,
          installationId: input.id,
          siteId: null,
          scope: 'installation',
          eventMonths: input.eventMonths,
          profileMonths: input.profileMonths,
          replayMonths: input.replayMonths,
          version: 1,
          status: 'active',
          effectiveFrom: input.createdAt,
          effectiveTo: null,
          changedBy: null,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .run()
      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation insert returned no row')
      return toRecord(row, {
        eventMonths: input.eventMonths,
        profileMonths: input.profileMonths,
        replayMonths: input.replayMonths,
      })
    })
  }

  async activate(
    input: InstallationRepository.ActivateInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (
        current === undefined ||
        current.status !== 'uninitialized' ||
        current.activeOperationId !== null ||
        !input.dataDirectoryReady
      ) {
        return undefined
      }

      const activePolicy = tx
        .select()
        .from(schema.TRetentionPolicy)
        .where(
          and(
            eq(schema.TRetentionPolicy.installationId, current.id),
            eq(schema.TRetentionPolicy.scope, 'installation'),
            eq(schema.TRetentionPolicy.status, 'active'),
          ),
        )
        .limit(1)
        .all()[0]
      if (activePolicy !== undefined && !sameRetention(activePolicy, input.retention)) {
        return undefined
      }
      if (activePolicy === undefined) {
        tx.insert(schema.TRetentionPolicy)
          .values({
            id: input.retentionPolicyId,
            installationId: current.id,
            siteId: null,
            scope: 'installation',
            eventMonths: input.retention.eventMonths,
            profileMonths: input.retention.profileMonths,
            replayMonths: input.retention.replayMonths,
            version: 1,
            status: 'active',
            effectiveFrom: input.updatedAt,
            effectiveTo: null,
            changedBy: null,
            createdAt: input.updatedAt,
            updatedAt: input.updatedAt,
          })
          .run()
      }

      const updated = tx
        .update(schema.TInstallation)
        .set({
          status: 'ready',
          eventRetentionMonths: input.retention.eventMonths,
          profileRetentionMonths: input.retention.profileMonths,
          replayRetentionMonths: input.retention.replayMonths,
          dataDirectoryReady: input.dataDirectoryReady,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(schema.TInstallation.singletonKey, 'default'),
            eq(schema.TInstallation.status, 'uninitialized'),
            isNull(schema.TInstallation.activeOperationId),
          ),
        )
        .run()
      if (updated.changes !== 1) return undefined

      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation activation returned no row')
      return toRecord(row, activePolicy ?? input.retention)
    })
  }

  async beginUpgrade(
    input: InstallationRepository.BeginUpgradeInput,
  ): Promise<InstallationRepository.Record> {
    return this.db.transaction((tx) => {
      const current = tx
        .select({ id: schema.TInstallation.id })
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (current === undefined) throw new Error('Installation is not initialized')
      const updated = tx
        .update(schema.TInstallation)
        .set({
          status: 'maintenance',
          activeOperationId: input.operationId,
          activeOperationKind: 'upgrade',
          activeOperationPhase: input.activeOperation.phase,
          activeOperationCheckpoint: input.activeOperation.checkpoint,
          activeOperationProgress: input.activeOperation.progress,
          activeOperationOwnerToken: input.ownerToken,
          activeOperationLastSafeSequence: input.activeOperation.lastSafeSequence,
          activeOperationErrorCode: input.activeOperation.errorCode,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TInstallation.singletonKey, 'default'),
            isNull(schema.TInstallation.activeOperationId),
          ),
        )
        .run()
      if (updated.changes !== 1) throw new Error('Installation lifecycle operation is active')
      tx.insert(schema.TBackupOperation)
        .values({
          id: input.operationId,
          operationType: 'upgrade',
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
      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation upgrade returned no row')
      return toRecord(row, selectActiveRetention(tx, row.id))
    })
  }

  async findSafetyArtifact(
    operationId: string,
  ): Promise<InstallationRepository.SafetyArtifactInput | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TBackupArtifact)
      .where(
        and(
          eq(schema.TBackupArtifact.operationId, operationId),
          eq(schema.TBackupArtifact.artifactType, 'authoritative_sqlite'),
        ),
      )
      .limit(1)
    const artifact = rows[0]
    if (
      artifact === undefined ||
      artifact.sizeBytes <= 0 ||
      artifact.checksumAlgorithm !== 'sha256' ||
      artifact.checksumValue.length === 0
    ) {
      return undefined
    }
    return toSafetyArtifact(artifact)
  }

  async recordSafetyArtifact(
    input: InstallationRepository.RecordSafetyArtifactInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const operation = selectUpgradeOperation(tx, input.operationId)
      if (operation === undefined || operation.ownerToken !== input.ownerToken) return undefined

      const existing = tx
        .select()
        .from(schema.TBackupArtifact)
        .where(
          and(
            eq(schema.TBackupArtifact.operationId, input.operationId),
            eq(schema.TBackupArtifact.artifactType, 'authoritative_sqlite'),
          ),
        )
        .limit(1)
        .all()[0]
      if (existing === undefined) {
        tx.insert(schema.TBackupArtifact)
          .values({
            id: input.artifact.id,
            operationId: input.operationId,
            artifactType: 'authoritative_sqlite',
            generationId: input.artifact.generationId,
            storageKey: input.artifact.storageKey,
            schemaVersion: input.artifact.schemaVersion,
            retentionBoundary: null,
            acceptanceSequence: null,
            sizeBytes: input.artifact.sizeBytes,
            checksumAlgorithm: input.artifact.checksumAlgorithm,
            checksumValue: input.artifact.checksumValue,
            metadata: null,
            createdAt: input.now,
          })
          .run()
      } else if (!sameSafetyArtifact(existing, input.artifact)) {
        tx.update(schema.TBackupArtifact)
          .set({
            generationId: input.artifact.generationId,
            storageKey: input.artifact.storageKey,
            schemaVersion: input.artifact.schemaVersion,
            sizeBytes: input.artifact.sizeBytes,
            checksumAlgorithm: input.artifact.checksumAlgorithm,
            checksumValue: input.artifact.checksumValue,
          })
          .where(eq(schema.TBackupArtifact.id, existing.id))
          .run()
      }

      return updateUpgradeProgressTx(tx, {
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        checkpoint: 'sqlite_captured',
        progress: 0.25,
        backupPhase: 'capturing_sqlite',
        now: input.now,
      })
    })
  }

  async updateUpgradeProgress(
    input: InstallationRepository.UpdateUpgradeProgressInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => updateUpgradeProgressTx(tx, input))
  }

  async claimUpgrade(
    input: InstallationRepository.ClaimUpgradeInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const current = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (
        current === undefined ||
        current.activeOperationId !== input.operationId ||
        current.activeOperationOwnerToken === input.ownerToken ||
        current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()
      ) {
        return undefined
      }
      const operation = selectUpgradeOperation(tx, input.operationId)
      if (operation === undefined || operation.ownerToken !== current.activeOperationOwnerToken) {
        return undefined
      }

      const updated = tx
        .update(schema.TInstallation)
        .set({
          status: 'recovering',
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
      if (updated.changes !== 1) return undefined

      const operationUpdated = tx
        .update(schema.TBackupOperation)
        .set({ ownerToken: input.ownerToken, updatedAt: input.now })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.operationType, 'upgrade'),
            operationOwnerCondition(operation.ownerToken),
          ),
        )
        .run()
      if (operationUpdated.changes !== 1) throw new Error('Upgrade claim was lost')

      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Upgrade claim returned no installation')
      return toRecord(row, selectActiveRetention(tx, row.id))
    })
  }

  async completeUpgrade(
    input: InstallationRepository.UpgradeTerminalInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const updatedInstallation = tx
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
      if (updatedInstallation.changes !== 1) return undefined

      const updatedOperation = tx
        .update(schema.TBackupOperation)
        .set({
          status: 'available',
          phase: 'ready',
          progress: 1,
          checkpoint: 'structurally_ready',
          controlReadiness: 'ready',
          analyticsReadiness: 'ready',
          structuralReadiness: 'ready',
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.operationType, 'upgrade'),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
          ),
        )
        .run()
      if (updatedOperation.changes !== 1) throw new Error('Upgrade completion was lost')

      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Upgrade completion returned no installation')
      return toRecord(row, selectActiveRetention(tx, row.id))
    })
  }

  async failUpgrade(
    input: InstallationRepository.UpgradeTerminalInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const updatedInstallation = tx
        .update(schema.TInstallation)
        .set({
          status: 'degraded',
          activeOperationId: null,
          activeOperationKind: null,
          activeOperationPhase: null,
          activeOperationCheckpoint: null,
          activeOperationProgress: null,
          activeOperationOwnerToken: null,
          activeOperationLastSafeSequence: null,
          activeOperationErrorCode: null,
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
      if (updatedInstallation.changes !== 1) return undefined

      const updatedOperation = tx
        .update(schema.TBackupOperation)
        .set({
          status: 'failed',
          phase: 'failed',
          errorCode: toBackupErrorCode(input.errorCode),
          completedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TBackupOperation.id, input.operationId),
            eq(schema.TBackupOperation.operationType, 'upgrade'),
            eq(schema.TBackupOperation.ownerToken, input.ownerToken),
          ),
        )
        .run()
      if (updatedOperation.changes !== 1) throw new Error('Upgrade failure recording was lost')

      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Upgrade failure returned no installation')
      return toRecord(row, selectActiveRetention(tx, row.id))
    })
  }

  private async findActiveRetention(
    installationId: string,
  ): Promise<InstallationRepository.Retention | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, installationId),
          eq(schema.TRetentionPolicy.scope, 'installation'),
          eq(schema.TRetentionPolicy.status, 'active'),
        ),
      )
      .limit(1)
    const policy = rows[0]
    return policy === undefined ? undefined : toRetention(policy)
  }
}

function selectActiveRetention(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  installationId: string,
): InstallationRepository.Retention | undefined {
  const policy = tx
    .select()
    .from(schema.TRetentionPolicy)
    .where(
      and(
        eq(schema.TRetentionPolicy.installationId, installationId),
        eq(schema.TRetentionPolicy.scope, 'installation'),
        eq(schema.TRetentionPolicy.status, 'active'),
      ),
    )
    .limit(1)
    .all()[0]
  return policy === undefined ? undefined : toRetention(policy)
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

function selectUpgradeOperation(tx: SqliteTransaction, operationId: string) {
  return tx
    .select()
    .from(schema.TBackupOperation)
    .where(
      and(
        eq(schema.TBackupOperation.id, operationId),
        eq(schema.TBackupOperation.operationType, 'upgrade'),
      ),
    )
    .limit(1)
    .all()[0]
}

function operationOwnerCondition(ownerToken: string | null) {
  return ownerToken === null
    ? isNull(schema.TBackupOperation.ownerToken)
    : eq(schema.TBackupOperation.ownerToken, ownerToken)
}

function updateUpgradeProgressTx(
  tx: SqliteTransaction,
  input: InstallationRepository.UpdateUpgradeProgressInput,
): InstallationRepository.Record | undefined {
  const updatedOperation = tx
    .update(schema.TBackupOperation)
    .set({
      phase: input.backupPhase,
      progress: input.progress,
      checkpoint: input.checkpoint,
      analyticsReadiness: input.backupPhase === 'rebuilding_duckdb' ? 'rebuilding' : 'ready',
      updatedAt: input.now,
      startedAt: input.now,
    })
    .where(
      and(
        eq(schema.TBackupOperation.id, input.operationId),
        eq(schema.TBackupOperation.operationType, 'upgrade'),
        eq(schema.TBackupOperation.ownerToken, input.ownerToken),
      ),
    )
    .run()
  if (updatedOperation.changes !== 1) return undefined

  const updatedInstallation = tx
    .update(schema.TInstallation)
    .set({
      activeOperationCheckpoint: input.checkpoint,
      activeOperationProgress: input.progress,
      activeOperationPhase: 'pre_upgrade_safety',
      activeOperationLastSafeSequence: null,
      activeOperationErrorCode: null,
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
  if (updatedInstallation.changes !== 1) throw new Error('Upgrade progress update was lost')

  const row = tx
    .select()
    .from(schema.TInstallation)
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .limit(1)
    .all()[0]
  if (row === undefined) throw new Error('Upgrade progress returned no installation')
  return toRecord(row, selectActiveRetention(tx, row.id))
}

function toRetention(
  row: typeof schema.TRetentionPolicy.$inferSelect,
): InstallationRepository.Retention {
  return {
    eventMonths: row.eventMonths,
    profileMonths: row.profileMonths,
    replayMonths: row.replayMonths,
  }
}

function sameRetention(
  current: typeof schema.TRetentionPolicy.$inferSelect,
  next: InstallationRepository.Retention,
): boolean {
  return (
    current.eventMonths === next.eventMonths &&
    current.profileMonths === next.profileMonths &&
    current.replayMonths === next.replayMonths
  )
}

function toBackupErrorCode(
  errorCode: InstallationRepository.UpgradeTerminalInput['errorCode'],
):
  | 'BACKUP_FAILED'
  | 'INCOMPATIBLE_BACKUP'
  | 'INSUFFICIENT_STORAGE'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR' {
  if (
    errorCode === 'BACKUP_FAILED' ||
    errorCode === 'INCOMPATIBLE_BACKUP' ||
    errorCode === 'INSUFFICIENT_STORAGE' ||
    errorCode === 'CONFLICT' ||
    errorCode === 'INTERNAL_SERVER_ERROR'
  ) {
    return errorCode
  }
  return 'INTERNAL_SERVER_ERROR'
}

function toRecord(
  row: typeof schema.TInstallation.$inferSelect,
  retention?: InstallationRepository.Retention,
): InstallationRepository.Record {
  const activeOperation = toActiveOperation(row)
  return {
    id: row.id,
    status: row.status,
    defaultRetention: {
      eventMonths: retention?.eventMonths ?? row.eventRetentionMonths,
      profileMonths: retention?.profileMonths ?? row.profileRetentionMonths,
      replayMonths: retention?.replayMonths ?? row.replayRetentionMonths,
    },
    dataDirectoryReady: row.dataDirectoryReady,
    activeOperation,
    cleanupPending: row.cleanupPending,
    derivedCleanup: {
      status: row.derivedCleanupStatus,
      startedAt: row.derivedCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.derivedCleanupCompletedAt?.toISOString() ?? null,
      errorCode: parseErrorCode(row.derivedCleanupErrorCode),
    },
    backupCleanup: {
      status: row.backupCleanupStatus,
      startedAt: row.backupCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.backupCleanupCompletedAt?.toISOString() ?? null,
      errorCode: parseErrorCode(row.backupCleanupErrorCode),
    },
    updatedAt: row.updatedAt.toISOString(),
  }
}

function parseErrorCode(value: string | null): InstallationRepository.CleanupStage['errorCode'] {
  return value === null ? null : v.parse(contractSchema.SLifecycleErrorCode, value)
}

function toSafetyArtifact(
  row: typeof schema.TBackupArtifact.$inferSelect,
): InstallationRepository.SafetyArtifactInput {
  return {
    id: row.id,
    generationId: row.generationId,
    storageKey: row.storageKey,
    schemaVersion: row.schemaVersion,
    sizeBytes: row.sizeBytes,
    checksumAlgorithm: v.parse(v.literal('sha256'), row.checksumAlgorithm),
    checksumValue: row.checksumValue,
  }
}

function sameSafetyArtifact(
  row: typeof schema.TBackupArtifact.$inferSelect,
  artifact: InstallationRepository.SafetyArtifactInput,
): boolean {
  return (
    row.generationId === artifact.generationId &&
    row.storageKey === artifact.storageKey &&
    row.schemaVersion === artifact.schemaVersion &&
    row.sizeBytes === artifact.sizeBytes &&
    row.checksumAlgorithm === artifact.checksumAlgorithm &&
    row.checksumValue === artifact.checksumValue
  )
}

function toActiveOperation(
  row: typeof schema.TInstallation.$inferSelect,
): InstallationRepository.ActiveOperation | null {
  if (row.activeOperationId === null) {
    if (
      row.activeOperationKind !== null ||
      row.activeOperationPhase !== null ||
      row.activeOperationCheckpoint !== null ||
      row.activeOperationProgress !== null ||
      row.activeOperationOwnerToken !== null ||
      row.activeOperationLastSafeSequence !== null ||
      row.activeOperationErrorCode !== null
    ) {
      throw new Error('Installation active operation is inconsistent')
    }
    return null
  }
  if (row.activeOperationKind === null || row.activeOperationPhase === null) {
    throw new Error('Installation active operation is inconsistent')
  }
  return {
    operationId: row.activeOperationId,
    kind: v.parse(contractSchema.SLifecycleOperationKind, row.activeOperationKind),
    phase: v.parse(contractSchema.SLifecycleOperationPhase, row.activeOperationPhase),
    checkpoint: v.parse(
      contractSchema.SLifecycleOperationCheckpoint,
      row.activeOperationCheckpoint ?? 'none',
    ),
    progress: row.activeOperationProgress,
    lastSafeSequence: row.activeOperationLastSafeSequence,
    errorCode:
      row.activeOperationErrorCode === null
        ? null
        : v.parse(contractSchema.SLifecycleErrorCode, row.activeOperationErrorCode),
  }
}
