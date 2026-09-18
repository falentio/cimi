import type { LifecycleLock } from '@cimi/kernel'
import { getLogger, toLogError } from '@cimi/logging'
import { generateId } from '@cimi/utils'
import type { SiteRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000
const logger = getLogger(['cimi', 'api', 'worker', 'site-lifecycle'])

export interface SiteLifecycleWorkerDependencies {
  repository: SiteRepository
  lock: LifecycleLock
  intervalMs?: number
  onError?: (error: unknown) => void
  onPurgedSite?: (input: { siteId: string; now: Date }) => Promise<void>
}

export class SiteLifecycleWorker {
  private readonly repository: SiteRepository
  private readonly lock: LifecycleLock
  private readonly intervalMs: number
  private readonly onError: (error: unknown) => void
  private readonly onPurgedSite:
    | ((input: { siteId: string; now: Date }) => Promise<void>)
    | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private timerGeneration = 0
  private runPromise: Promise<void> | undefined

  constructor({
    repository,
    lock,
    intervalMs = DEFAULT_INTERVAL_MS,
    onError,
    onPurgedSite,
  }: SiteLifecycleWorkerDependencies) {
    this.repository = repository
    this.lock = lock
    this.intervalMs = intervalMs
    this.onError =
      onError ??
      ((error) => logger.error('Site lifecycle worker failed', { error: toLogError(error) }))
    this.onPurgedSite = onPurgedSite
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
    const timerGeneration = ++this.timerGeneration
    this.timer = setInterval(() => {
      if (this.timerGeneration !== timerGeneration) return
      void this.runOnce()
    }, this.intervalMs)
    this.timer.unref?.()
    void this.runOnce()
  }

  async stop(): Promise<void> {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
      this.timerGeneration += 1
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
        const result = await this.repository.purge({
          siteId,
          operationId: generateId('sop'),
          requestedAt: now,
        })
        if (result.status !== 'completed') return
        await this.onPurgedSite?.({ siteId, now })
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
