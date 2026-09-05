import { describe, expect, it } from 'vitest'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

async function createQueuedRepository() {
  const fixture = createSiteDrizzleFixture()
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
  return {
    fixture,
    repository,
    [Symbol.dispose]() {
      fixture[Symbol.dispose]()
    },
  }
}

describe('RetentionPolicyRepositoryDrizzle.claimNext concurrency', () => {
  it('awards a queued run to exactly one claimant', async () => {
    using created = await createQueuedRepository()
    const first = await created.repository.claimNext({ now })
    const second = await created.repository.claimNext({ now })

    expect(first?.runId).toBeDefined()
    expect(second).toBeUndefined()
  })

  it('requeues interrupted work and converges on reclaim plus succeed', async () => {
    using created = await createQueuedRepository()
    const first = await created.repository.claimNext({ now })
    expect(first?.runId).toBeDefined()

    await created.repository.recoverInterrupted(new Date(now.getTime() + 1))
    const reclaimed = await created.repository.claimNext({
      now: new Date(now.getTime() + 2),
    })
    expect(reclaimed?.runId).toBe(first?.runId)

    await created.repository.succeed({
      runId: reclaimed!.runId,
      kind: reclaimed!.kind,
      now: new Date(now.getTime() + 3),
    })
    const resolved = await created.repository.findResolved({ siteId: null })
    expect(resolved.cleanup.derived.status).toBe('completed')
  })
})
