import type { LifecycleLock } from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import type { SiteRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000

export interface SiteLifecycleWorkerDependencies {
  repository: SiteRepository
  lock: LifecycleLock
  intervalMs?: number
  onError?: (error: unknown) => void
}

export class SiteLifecycleWorker {
  private readonly repository: SiteRepository
  private readonly lock: LifecycleLock
  private readonly intervalMs: number
  private readonly onError: (error: unknown) => void
  private timer: ReturnType<typeof setInterval> | undefined
  private runPromise: Promise<void> | undefined

  constructor({
    repository,
    lock,
    intervalMs = DEFAULT_INTERVAL_MS,
    onError,
  }: SiteLifecycleWorkerDependencies) {
    this.repository = repository
    this.lock = lock
    this.intervalMs = intervalMs
    this.onError = onError ?? ((error) => console.error('Site lifecycle worker failed', error))
  }

  runOnce(now = new Date()): Promise<void> {
    if (this.runPromise !== undefined) return this.runPromise
    this.runPromise = this.process(now)
      .catch((error: unknown) => this.onError(error))
      .finally(() => {
        this.runPromise = undefined
      })
    return this.runPromise
  }

  start(): void {
    if (this.timer !== undefined) return
    this.timer = setInterval(() => {
      void this.runOnce()
    }, this.intervalMs)
    this.timer.unref?.()
    void this.runOnce()
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    await this.runPromise
  }

  private async process(now: Date): Promise<void> {
    const operations = await this.repository.findPendingLifecycleOperations()
    for (const operation of operations) {
      await this.withLease(
        operation.operationType === 'delete' ? 'site_deletion' : 'site_recovery',
        async () => {
          if (operation.operationType === 'delete') {
            await this.repository.completeDelete({
              siteId: operation.siteId,
              operationId: operation.operationId,
              completedAt: now,
            })
          } else {
            await this.repository.completeRecover({
              siteId: operation.siteId,
              operationId: operation.operationId,
              completedAt: now,
            })
          }
        },
      )
    }

    const duePurges = await this.repository.findDuePurges(now)
    for (const { siteId } of duePurges) {
      await this.withLease('site_purge', async () => {
        await this.repository.purge({
          siteId,
          operationId: generateId('sop'),
          requestedAt: now,
        })
      })
    }
  }

  private async withLease(
    kind: 'site_deletion' | 'site_recovery' | 'site_purge',
    work: () => Promise<void>,
  ): Promise<void> {
    const lease = await this.lock.acquire(kind)
    if (lease === undefined) return
    try {
      await work()
    } catch (error) {
      this.onError(error)
    } finally {
      await lease.release()
    }
  }
}
