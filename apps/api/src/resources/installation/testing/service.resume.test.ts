import { describe, expect, it, vi } from 'vitest'
import {
  createFakeUpgradeExecutor,
  createInstallationFixture,
  createInstallationRecord,
} from '../fixture.ts'

const activeOperation = {
  operationId: 'bop_1',
  kind: 'upgrade',
  phase: 'pre_upgrade_safety',
  checkpoint: 'none',
  progress: 0,
  lastSafeSequence: null,
  errorCode: null,
} as const
const siteOperation = { ...activeOperation, kind: 'site_deletion' as const }
const freshClock = () => new Date('2026-09-01T00:01:00.000Z')
const staleClock = () => new Date('2026-09-01T00:10:00.000Z')

describe('InstallationService.resumeOnStartup', () => {
  it('does not flip a fresh interrupted operation to recovering', async () => {
    const executor = createFakeUpgradeExecutor({ createSafetyArtifact: vi.fn() })
    const { repository, service } = createInstallationFixture({
      clock: freshClock,
      upgradeExecutor: executor,
    })
    repository.find.mockResolvedValue(
      createInstallationRecord({
        status: 'maintenance',
        activeOperation,
        updatedAt: '2026-09-01T00:00:00.000Z',
      }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'maintenance', activeOperation })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
    expect(executor.createSafetyArtifact).not.toHaveBeenCalled()
  })

  it('claims a stale operation and resumes through the executor', async () => {
    const executor = createFakeUpgradeExecutor({
      createSafetyArtifact: vi.fn().mockResolvedValue({
        id: 'bar_1',
        generationId: 'bop_1',
        storageKey: 'safety/bop_1.sqlite',
        schemaVersion: '1',
        sizeBytes: 8,
        checksumAlgorithm: 'sha256',
        checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
      migrate: vi.fn().mockResolvedValue(undefined),
      rebuildAnalytics: vi.fn().mockResolvedValue(undefined),
    })
    const { repository, service } = createInstallationFixture({
      clock: staleClock,
      upgradeExecutor: executor,
    })
    const stored = createInstallationRecord({
      status: 'maintenance',
      activeOperation,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const claimed = createInstallationRecord({
      status: 'recovering',
      activeOperation,
      updatedAt: '2026-09-01T00:10:00.000Z',
    })
    repository.find.mockResolvedValue(stored)
    repository.claimUpgrade.mockResolvedValue(claimed)
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(claimed)
    repository.updateUpgradeProgress.mockResolvedValue(claimed)
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()
    await service.stop()

    expect(result).toMatchObject({ status: 'recovering' })
    expect(repository.claimUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'bop_1',
        expectedUpdatedAt: new Date('2026-09-01T00:00:00.000Z'),
        now: new Date('2026-09-01T00:10:00.000Z'),
      }),
    )
    expect(executor.migrate).toHaveBeenCalledWith({ operationId: 'bop_1' })
    expect(repository.completeUpgrade).toHaveBeenCalled()
  })

  it('does not steal a stale operation after a lost claim race', async () => {
    const executor = createFakeUpgradeExecutor({ createSafetyArtifact: vi.fn() })
    const { repository, service } = createInstallationFixture({
      clock: staleClock,
      upgradeExecutor: executor,
    })
    const stored = createInstallationRecord({
      status: 'maintenance',
      activeOperation,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    repository.find.mockResolvedValue(stored)
    repository.claimUpgrade.mockResolvedValue(undefined)

    await expect(service.resumeOnStartup()).resolves.toMatchObject({ status: 'maintenance' })
    expect(executor.createSafetyArtifact).not.toHaveBeenCalled()
  })

  it('leaves site lifecycle operations for the site worker', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'ready', activeOperation: siteOperation }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready', activeOperation: siteOperation })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('leaves an installation without an operation alone', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    repository.find.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready', activeOperation: null })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })
})
