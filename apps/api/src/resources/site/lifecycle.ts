import { generateId } from '@cimi/utils'
import type { SiteRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000

export interface SiteLifecycleWorkerDependencies {
  repository: SiteRepository
  intervalMs?: number
  onError?: (error: unknown) => void
}

export class SiteLifecycleWorker {
  private readonly repository: SiteRepository
  private readonly intervalMs: number
  private readonly onError: (error: unknown) => void
  private timer: ReturnType<typeof setInterval> | undefined
  private runPromise: Promise<void> | undefined

  constructor({
    repository,
    intervalMs = DEFAULT_INTERVAL_MS,
    onError,
  }: SiteLifecycleWorkerDependencies) {
    this.repository = repository
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
      try {
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
      } catch (error) {
        this.onError(error)
      }
    }

    const duePurges = await this.repository.findDuePurges(now)
    for (const { siteId } of duePurges) {
      try {
        await this.repository.purge({
          siteId,
          operationId: generateId('site-operation'),
          requestedAt: now,
        })
      } catch (error) {
        this.onError(error)
      }
    }
  }
}
