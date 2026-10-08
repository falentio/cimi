import { schema } from '@cimi/db'
import { describe, expect, it } from 'vitest'
import { createBackupDrizzleFixture, createdAt } from './fixture.ts'

function insertOperation(
  db: ReturnType<typeof createBackupDrizzleFixture>['db'],
  input: {
    readonly id: string
    readonly operationType: 'backup' | 'restore' | 'upgrade'
    readonly status: 'creating' | 'available' | 'restoring' | 'failed'
  },
): void {
  db.insert(schema.TBackupOperation)
    .values({
      id: input.id,
      operationType: input.operationType,
      status: input.status,
      scope: 'installation',
      phase: input.status === 'failed' ? 'failed' : 'capturing_sqlite',
      progress: 0,
      checkpoint: 'none',
      lastSafeSequence: null,
      controlReadiness: 'ready',
      analyticsReadiness: 'ready',
      structuralReadiness: 'not_ready',
      cleanupPending: false,
      errorCode: null,
      recoveryKey: null,
      createdAt,
      startedAt: null,
      completedAt: null,
      updatedAt: createdAt,
      ownerToken: 'owner_1',
    })
    .run()
}

describe('BackupRestoreRepositoryDrizzle.findLiveSafetyOperationIds', () => {
  it('treats a creating operation as live', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const { db, repository } = fixture

    insertOperation(db, { id: 'bop_creating', operationType: 'upgrade', status: 'creating' })

    await expect(repository.findLiveSafetyOperationIds(['bop_creating'])).resolves.toEqual(
      new Set(['bop_creating']),
    )
  })

  it('treats a restoring operation as live', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const { db, repository } = fixture

    insertOperation(db, { id: 'bop_restoring', operationType: 'restore', status: 'restoring' })

    await expect(repository.findLiveSafetyOperationIds(['bop_restoring'])).resolves.toEqual(
      new Set(['bop_restoring']),
    )
  })

  it('keeps the installation active operation even when it has failed', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const { db, repository } = fixture

    insertOperation(db, { id: 'bop_recovery', operationType: 'restore', status: 'failed' })

    db.update(schema.TInstallation)
      .set({ activeOperationId: 'bop_recovery', activeOperationKind: 'restore' })
      .run()

    await expect(repository.findLiveSafetyOperationIds(['bop_recovery'])).resolves.toEqual(
      new Set(['bop_recovery']),
    )
  })

  it('does not treat an available operation or an unknown id as live', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const { db, repository } = fixture

    insertOperation(db, { id: 'bop_available', operationType: 'backup', status: 'available' })

    await expect(
      repository.findLiveSafetyOperationIds(['bop_available', 'bop_absent']),
    ).resolves.toEqual(new Set())
  })

  it('returns an empty set for empty input', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const { repository } = fixture

    await expect(repository.findLiveSafetyOperationIds([])).resolves.toEqual(new Set())
  })
})
