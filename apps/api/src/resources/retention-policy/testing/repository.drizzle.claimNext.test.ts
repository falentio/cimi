import { describe, expect, it } from 'vitest'
import { createSiteDrizzleFixture } from '../../site/fixture.drizzle.ts'
import { createInstallationInsertInput } from '../../installation/fixture.drizzle.ts'
import { InstallationRepositoryDrizzle } from '../../installation/repository.drizzle.ts'
import { RetentionPolicyRepositoryDrizzle } from '../repository.drizzle.ts'

const now = new Date('2026-09-05T14:30:00.000Z')

async function createRepository() {
  const fixture = createSiteDrizzleFixture()
  await new InstallationRepositoryDrizzle({ db: fixture.db }).insert(
    createInstallationInsertInput(),
  )
  const repository = new RetentionPolicyRepositoryDrizzle({ db: fixture.db })
  return {
    fixture,
    repository,
    [Symbol.dispose]() {
      fixture[Symbol.dispose]()
    },
  }
}

describe('RetentionPolicyRepositoryDrizzle.claimNext', () => {
  it('recovers a failed run through reclaim and succeed', async () => {
    using created = await createRepository()
    await created.repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: 1 },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })
    const claimed = await created.repository.claimNext({ now })
    expect(claimed?.kind).toBe('derived')
    await created.repository.fail({
      runId: claimed!.runId,
      kind: claimed!.kind,
      now,
      errorCode: 'CLEANUP_FAILED',
      errorMessage: 'cleanup failed',
    })

    const retried = await created.repository.claimNext({ now: new Date(now.getTime() + 1) })
    expect(retried?.runId).toBe(claimed!.runId)
  })

  it('does not wedge when a failed run is superseded by a new queued run', async () => {
    using created = await createRepository()
    await created.repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 6, profileMonths: 3, replayMonths: 1 },
      policyId: 'rtn_2',
      changedBy: 'user_1',
      now,
    })
    const first = await created.repository.claimNext({ now })
    expect(first?.kind).toBe('derived')
    await created.repository.fail({
      runId: first!.runId,
      kind: first!.kind,
      now,
      errorCode: 'CLEANUP_FAILED',
      errorMessage: 'cleanup failed',
    })

    await created.repository.commitPolicyChange({
      target: { scope: 'installation' },
      policy: { eventMonths: 3, profileMonths: 2, replayMonths: null },
      policyId: 'rtn_3',
      changedBy: 'user_1',
      now: new Date(now.getTime() + 1),
    })

    const next = await created.repository.claimNext({ now: new Date(now.getTime() + 2) })
    expect(next?.kind).toBe('derived')
  })
})
