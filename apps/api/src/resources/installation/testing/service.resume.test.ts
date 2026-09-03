import { describe, expect, it } from 'vitest'
import { createInstallationFixture, createInstallationRecord } from '../fixture.ts'

const activeOperation = {
  operationId: 'bop_1',
  kind: 'upgrade',
  phase: 'pre_upgrade_safety',
  progress: 0,
  lastSafeSequence: null,
  errorCode: null,
} as const

describe('InstallationService.resumeOnStartup', () => {
  it('moves a stalled operation to recovering', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'maintenance', activeOperation }),
    )
    repository.update.mockResolvedValue(
      createInstallationRecord({ status: 'recovering', activeOperation }),
    )

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'recovering' })
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'recovering', activeOperation }),
    )
  })

  it('leaves an installation without an operation alone', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(createInstallationRecord())

    const result = await service.resumeOnStartup()

    expect(result).toMatchObject({ status: 'ready' })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('keeps recovering until health passes', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(
      createInstallationRecord({ status: 'recovering', activeOperation }),
    )

    const first = await service.resumeOnStartup()
    const second = await service.resumeOnStartup()

    expect(first).toMatchObject({ status: 'recovering' })
    expect(second).toMatchObject({ status: 'recovering' })
    expect(repository.update).not.toHaveBeenCalled()
  })

  it('returns undefined without an installation', async () => {
    const { repository, service } = createInstallationFixture()
    repository.find.mockResolvedValue(undefined)

    await expect(service.resumeOnStartup()).resolves.toBeUndefined()
    expect(repository.update).not.toHaveBeenCalled()
  })
})
