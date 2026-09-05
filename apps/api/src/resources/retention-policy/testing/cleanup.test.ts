import { describe, expect, it } from 'vitest'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { schema } from '@cimi/db'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionCleanupWorker } from '../cleanup.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

describe('RetentionCleanupWorker', () => {
  it('completes derived cleanup before backup cleanup', async () => {
    using fixture = createSiteDrizzleFixture()
    await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
      createInstallationInsertInput(),
    )
    const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
    await repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: 1 },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })
    const calls: string[] = []
    const worker = new RetentionCleanupWorker({
      repository,
      lock: new InMemoryLifecycleLock(),
      cleanup: {
        async runDerived() {
          calls.push('derived')
          return { completed: true, cursor: null, processedThrough: now }
        },
        async runBackup() {
          calls.push('backup')
          return { completed: true, cursor: null, processedThrough: now }
        },
      },
    })

    await worker.runOnce(now)
    expect(calls).toEqual(['derived'])
    expect(fixture.db.select().from(schema.TInstallation).all()[0]).toMatchObject({
      cleanupPending: true,
      derivedCleanupStatus: 'completed',
      backupCleanupStatus: 'pending',
    })

    await worker.runOnce(now)
    expect(calls).toEqual(['derived', 'backup'])
    expect(fixture.db.select().from(schema.TInstallation).all()[0]).toMatchObject({
      cleanupPending: false,
      derivedCleanupStatus: 'completed',
      backupCleanupStatus: 'completed',
    })
  })
})
