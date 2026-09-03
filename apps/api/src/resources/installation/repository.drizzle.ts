import { eq } from 'drizzle-orm'
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
    return row === undefined ? undefined : toRecord(row)
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
          activeOperationProgress: null,
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
      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation insert returned no row')
      return toRecord(row)
    })
  }

  async update(
    input: InstallationRepository.UpdateInput,
  ): Promise<InstallationRepository.Record | undefined> {
    return this.db.transaction((tx) => {
      const current = tx
        .select({ id: schema.TInstallation.id })
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (current === undefined) return undefined
      tx.update(schema.TInstallation)
        .set({
          status: input.status,
          activeOperationId: input.activeOperation?.operationId ?? null,
          activeOperationKind: input.activeOperation?.kind ?? null,
          activeOperationPhase: input.activeOperation?.phase ?? null,
          activeOperationProgress: input.activeOperation?.progress ?? null,
          activeOperationLastSafeSequence: input.activeOperation?.lastSafeSequence ?? null,
          activeOperationErrorCode: input.activeOperation?.errorCode ?? null,
          ...(input.retention === undefined
            ? {}
            : {
                eventRetentionMonths: input.retention.eventMonths,
                profileRetentionMonths: input.retention.profileMonths,
                replayRetentionMonths: input.retention.replayMonths,
              }),
          ...(input.dataDirectoryReady === undefined
            ? {}
            : { dataDirectoryReady: input.dataDirectoryReady }),
          updatedAt: input.updatedAt,
        })
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .run()
      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation update returned no row')
      return toRecord(row)
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
      tx.update(schema.TInstallation)
        .set({
          status: 'maintenance',
          activeOperationId: input.operationId,
          activeOperationKind: 'upgrade',
          activeOperationPhase: input.activeOperation.phase,
          activeOperationProgress: input.activeOperation.progress,
          activeOperationLastSafeSequence: input.activeOperation.lastSafeSequence,
          activeOperationErrorCode: input.activeOperation.errorCode,
          updatedAt: input.now,
        })
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .run()
      tx.insert(schema.TBackupOperation)
        .values({
          id: input.operationId,
          operationType: 'backup',
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
        })
        .run()
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
      const row = tx
        .select()
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (row === undefined) throw new Error('Installation upgrade returned no row')
      return toRecord(row)
    })
  }
}

function toRecord(row: typeof schema.TInstallation.$inferSelect): InstallationRepository.Record {
  return {
    id: row.id,
    status: row.status,
    defaultRetention: {
      eventMonths: row.eventRetentionMonths,
      profileMonths: row.profileRetentionMonths,
      replayMonths: row.replayRetentionMonths,
    },
    dataDirectoryReady: row.dataDirectoryReady,
    activeOperation:
      row.activeOperationId === null
        ? null
        : {
            operationId: row.activeOperationId,
            kind: row.activeOperationKind ?? 'upgrade',
            phase: row.activeOperationPhase ?? 'pending',
            progress: row.activeOperationProgress,
            lastSafeSequence: row.activeOperationLastSafeSequence,
            errorCode:
              row.activeOperationErrorCode as InstallationRepository.ActiveOperation['errorCode'],
          },
    cleanupPending: row.cleanupPending,
    derivedCleanup: {
      status: row.derivedCleanupStatus,
      startedAt: row.derivedCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.derivedCleanupCompletedAt?.toISOString() ?? null,
      errorCode: row.derivedCleanupErrorCode as InstallationRepository.CleanupStage['errorCode'],
    },
    backupCleanup: {
      status: row.backupCleanupStatus,
      startedAt: row.backupCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.backupCleanupCompletedAt?.toISOString() ?? null,
      errorCode: row.backupCleanupErrorCode as InstallationRepository.CleanupStage['errorCode'],
    },
    updatedAt: row.updatedAt.toISOString(),
  }
}
