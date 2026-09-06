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
const backupOperation = { ...activeOperation, kind: 'backup' as const }
const staleClock = () => new Date('2026-09-01T00:10:00.000Z')

describe('InstallationService.resumeOnStartup', () => {
  it('claims an interrupted operation without waiting for it to become stale', async () => {
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
    })
    const { repository, service } = createInstallationFixture({
      clock: () => new Date('2026-09-01T00:01:00.000Z'),
      upgradeExecutor: executor,
    })
    const stored = createInstallationRecord({
      status: 'maintenance',
      activeOperation,
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    const claimed = createInstallationRecord({ status: 'recovering', activeOperation })
    repository.find.mockResolvedValue(stored)
    repository.claimUpgrade.mockResolvedValue(claimed)
    repository.findSafetyArtifact.mockResolvedValue(undefined)
    repository.recordSafetyArtifact.mockResolvedValue(claimed)
    repository.updateUpgradeProgress.mockResolvedValue(claimed)
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()
    await service.stop()

    expect(result).toMatchObject({ status: 'recovering', activeOperation })
    expect(repository.claimUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId: 'bop_1',
        expectedUpdatedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    )
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

  it('leaves backup operations for the backup-restore service', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'maintenance', activeOperation: backupOperation }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'maintenance', activeOperation: backupOperation })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('leaves an installation without an operation alone', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    repository.find.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready', activeOperation: null })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('returns undefined without claiming when the lock is held', async () => {
    const { repository, lock, service } = createInstallationFixture({ clock: staleClock })
    const lease = lock.acquire('upgrade')
    expect(lease).toBeDefined()
    try {
      await expect(service.resumeOnStartup()).resolves.toBeUndefined()
      expect(repository.find).not.toHaveBeenCalled()
      expect(repository.claimUpgrade).not.toHaveBeenCalled()
    } finally {
      if (lease !== undefined) lease.release()
    }
  })

  it('returns undefined when no installation record exists', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    repository.find.mockResolvedValue(undefined)

    await expect(service.resumeOnStartup()).resolves.toBeUndefined()
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('leaves a site_recovery operation for the site worker', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    const recoveryOperation = { ...activeOperation, kind: 'site_recovery' as const }
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'ready', activeOperation: recoveryOperation }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready', activeOperation: recoveryOperation })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('leaves a site_purge operation for the site worker', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    const purgeOperation = { ...activeOperation, kind: 'site_purge' as const }
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'ready', activeOperation: purgeOperation }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready', activeOperation: purgeOperation })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })

  it('skips creating a safety artifact when one already exists', async () => {
    const createSafetyArtifact = vi.fn()
    const migrate = vi.fn().mockResolvedValue(undefined)
    const executor = createFakeUpgradeExecutor({
      createSafetyArtifact,
      migrate,
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
    repository.findSafetyArtifact.mockResolvedValue({
      id: 'bar_1',
      generationId: 'bop_1',
      storageKey: 'safety/bop_1.sqlite',
      schemaVersion: '1',
      sizeBytes: 8,
      checksumAlgorithm: 'sha256' as const,
      checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    })
    repository.updateUpgradeProgress.mockResolvedValue(claimed)
    repository.completeUpgrade.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()
    await service.stop()

    expect(result).toMatchObject({ status: 'recovering' })
    expect(createSafetyArtifact).not.toHaveBeenCalled()
    expect(migrate).toHaveBeenCalledWith({ operationId: 'bop_1' })
  })

  it('records a failed upgrade when migration throws', async () => {
    const executor = createFakeUpgradeExecutor({
      createSafetyArtifact: vi.fn().mockResolvedValue({
        id: 'bar_1',
        generationId: 'bop_1',
        storageKey: 'safety/bop_1.sqlite',
        schemaVersion: '1',
        sizeBytes: 8,
        checksumAlgorithm: 'sha256' as const,
        checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
      migrate: vi.fn().mockRejectedValue(new Error('migration failed')),
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
    repository.failUpgrade.mockResolvedValue(
      createInstallationRecord({
        status: 'degraded',
        activeOperation: { ...activeOperation, errorCode: 'INTERNAL_SERVER_ERROR' },
      }),
    )

    await service.resumeOnStartup()
    await service.stop()

    expect(repository.failUpgrade).toHaveBeenCalledWith(
      expect.objectContaining({ operationId: 'bop_1' }),
    )
    expect(repository.completeUpgrade).not.toHaveBeenCalled()
  })

  it('treats a terminal operation as idle without resuming', async () => {
    const { repository, service } = createInstallationFixture({ clock: staleClock })
    const terminal = createInstallationRecord({
      status: 'degraded',
      activeOperation: { ...activeOperation, errorCode: 'INTERNAL_SERVER_ERROR' },
      updatedAt: '2026-09-01T00:00:00.000Z',
    })
    repository.find.mockResolvedValue(terminal)

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'degraded' })
    expect(repository.claimUpgrade).not.toHaveBeenCalled()
  })
})
