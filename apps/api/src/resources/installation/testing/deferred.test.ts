import type { AuthUser } from '@cimi/auth'
import { assertInstallationAdmin } from '@cimi/guard'
import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'
import {
  beginUpgradeInput,
  createInstallationDrizzleFixture,
  createInstallationInsertInput,
} from '../fixture.drizzle.ts'

// Red pins for the four deferred installation gaps. Each test asserts the
// desired behavior, fails today, and names its blocker plus green criterion.
// Convert or delete each one as its fix lands.

const admin = { id: 'user_1', role: 'admin', installationGrant: true } as unknown as AuthUser
const input = { confirmation: 'UPGRADE' } as const
const ids = {
  installationId: () => 'ins_1',
  retentionPolicyId: () => 'rtn_1',
  operationId: () => 'bop_1',
  artifactId: () => 'bar_1',
}
const maintenanceRecord = () =>
  createInstallationRecord({
    status: 'maintenance',
    activeOperation: {
      operationId: 'bop_1',
      kind: 'upgrade',
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      progress: 0,
      lastSafeSequence: null,
      errorCode: null,
    },
  })

describe('deferred installation gaps', () => {
  it('does not return 202 until the acceptance journal has drained', async () => {
    // Blocker: sync drain would hold 202 until the queues empty, which
    // lengthens upgrade latency for an unproven gain. The lock already gates
    // overlapping work. Green when upgrade awaits the drain before returning.
    const { repository, journal, service } = createInstallationFixture({ ids })
    let releaseDrain!: () => void
    const drained = new Promise<void>((resolve) => {
      releaseDrain = resolve
    })
    let drainCalls = 0
    journal.drain = () => {
      drainCalls += 1
      return drained
    }
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockImplementation(async () => maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(maintenanceRecord())
    repository.updateUpgradeProgress.mockResolvedValue(maintenanceRecord())
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    let returned = false
    const pending = service.upgrade(input, admin).then((result) => {
      returned = true
      return result
    })
    try {
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(drainCalls).toBe(1)
      expect(returned).toBe(false)
    } finally {
      releaseDrain()
      await service.stop()
    }
    await expect(pending).resolves.toMatchObject({ status: 'maintenance' })
  })

  it('does not mark an upgrade ready when the data directory is not ready', async () => {
    // Repository refuses ready without the data directory. Service re-reads
    // a refused completion and fails the op degraded so retry opens.
    using fixture = createInstallationDrizzleFixture()
    await fixture.repository.insert(createInstallationInsertInput({ dataDirectoryReady: false }))
    const now = new Date('2026-09-02T00:00:00.000Z')
    await fixture.repository.beginUpgrade(beginUpgradeInput('bop_1', now))

    const completed = await fixture.repository.completeUpgrade({
      operationId: 'bop_1',
      ownerToken: 'owner_1',
      now,
    })

    expect(completed?.status).not.toBe('ready')
  })

  it('records a durable failure when upgrade execution loses ownership', async () => {
    // Blocker: recording on ownership loss could mask the winning worker, so
    // the current code stays silent. service.upgrade.test.ts pins that silence
    // and must change with this. Green when ownership loss leaves a record.
    const { repository, service } = createInstallationFixture({ ids })
    repository.find.mockResolvedValue(createInstallationRecord())
    repository.beginUpgrade.mockResolvedValue(maintenanceRecord())
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(undefined)

    await service.upgrade(input, admin)
    await service.stop()

    expect(repository.failUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )
  })

  it('rejects a role admin without an explicit installation grant', () => {
    // Blocker: the installation principal shape is still a product decision.
    // Landing the guard change means migrating every caller that passes a
    // bare role admin today. Green when the guard requires the grant.
    const bareAdmin = { id: 'user_1', role: 'admin' } as unknown as AuthUser

    expect(() => assertInstallationAdmin(bareAdmin)).toThrow()
  })
})
