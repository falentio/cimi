import { describe, expect, it, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { SiteRepository } from '../repository.ts'
import { SiteLifecycleWorker } from '../lifecycle.ts'

const now = new Date('2026-09-03T00:00:00.000Z')

function createWorker() {
  const repository = mock<SiteRepository>()
  repository.findPendingLifecycleOperations.mockResolvedValue([])
  repository.findDuePurges.mockResolvedValue([])
  const onError = vi.fn()
  const worker = new SiteLifecycleWorker({ repository, onError })
  return { repository, onError, worker }
}

describe('SiteLifecycleWorker', () => {
  it('completes pending delete and recover operations', async () => {
    const { repository, onError, worker } = createWorker()
    repository.findPendingLifecycleOperations.mockResolvedValue([
      { siteId: 'site_1', operationId: 'operation_1', operationType: 'delete', status: 'pending' },
      { siteId: 'site_2', operationId: 'operation_2', operationType: 'recover', status: 'running' },
    ])
    repository.completeDelete.mockResolvedValue({ status: 'completed' })
    repository.completeRecover.mockResolvedValue({ status: 'completed' })

    await expect(worker.runOnce(now)).resolves.toBeUndefined()
    expect(repository.completeDelete).toHaveBeenCalledWith({
      siteId: 'site_1',
      operationId: 'operation_1',
      completedAt: now,
    })
    expect(repository.completeRecover).toHaveBeenCalledWith({
      siteId: 'site_2',
      operationId: 'operation_2',
      completedAt: now,
    })
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports a failing operation and continues with the rest', async () => {
    const { repository, onError, worker } = createWorker()
    repository.findPendingLifecycleOperations.mockResolvedValue([
      { siteId: 'site_1', operationId: 'operation_1', operationType: 'delete', status: 'pending' },
      { siteId: 'site_2', operationId: 'operation_2', operationType: 'recover', status: 'pending' },
    ])
    repository.completeDelete.mockRejectedValue(new Error('completion lost'))
    repository.completeRecover.mockResolvedValue({ status: 'completed' })

    await expect(worker.runOnce(now)).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(repository.completeRecover).toHaveBeenCalledWith(
      expect.objectContaining({ siteId: 'site_2' }),
    )
  })

  it('reports a failing purge scan without throwing', async () => {
    const { repository, onError, worker } = createWorker()
    repository.findDuePurges.mockRejectedValue(new Error('purge scan failed'))

    await expect(worker.runOnce(now)).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('purges due sites and reports a failing purge while continuing', async () => {
    const { repository, onError, worker } = createWorker()
    repository.findDuePurges.mockResolvedValue([{ siteId: 'site_1' }, { siteId: 'site_2' }])
    repository.purge
      .mockRejectedValueOnce(new Error('purge lost'))
      .mockResolvedValueOnce({ status: 'completed' })

    await expect(worker.runOnce(now)).resolves.toBeUndefined()
    expect(repository.purge).toHaveBeenCalledTimes(2)
    expect(repository.purge).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ siteId: 'site_2', requestedAt: now }),
    )
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent runs into one pass', async () => {
    const { repository, worker } = createWorker()

    const first = worker.runOnce(now)
    const second = worker.runOnce(now)

    expect(second).toBe(first)
    await first
    expect(repository.findPendingLifecycleOperations).toHaveBeenCalledTimes(1)
  })

  it('starts once and stops a quiet worker', async () => {
    const { repository, onError } = createWorker()
    const intervalWorker = new SiteLifecycleWorker({
      repository,
      intervalMs: 60_000,
      onError,
    })

    intervalWorker.start()
    intervalWorker.start()
    await intervalWorker.stop()

    expect(repository.findPendingLifecycleOperations).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })

  it('waits for an in-flight run when stopping', async () => {
    const { repository, worker } = createWorker()
    let release!: () => void
    repository.findPendingLifecycleOperations.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([])
      }),
    )

    const running = worker.runOnce(now)
    const stopping = worker.stop()
    release()
    await running
    await stopping

    expect(repository.findPendingLifecycleOperations).toHaveBeenCalledTimes(1)
  })
})
