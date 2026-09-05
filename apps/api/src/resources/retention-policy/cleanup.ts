import type { LifecycleLock } from '@cimi/kernel'
import type { RetentionPolicyRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000

export interface RetentionCleanupBatchResult {
  completed: boolean
  cursor: string | null
  processedThrough: Date | null
}

export interface RetentionCleanupPort {
  runDerived(input: {
    runId: string
    siteId: string
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult>
  runBackup(input: {
    runId: string
    siteId: string
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult>
}

export interface RetentionCleanupWorkerDependencies {
  repository: RetentionPolicyRepository
  lock: LifecycleLock
  cleanup?: RetentionCleanupPort | undefined
  intervalMs?: number
  onError?: (error: unknown) => void
}

export class RetentionCleanupWorker {
  private readonly repository: RetentionPolicyRepository
  private readonly lock: LifecycleLock
  private readonly cleanup: RetentionCleanupPort | undefined
  private readonly intervalMs: number
  private readonly onError: (error: unknown) => void
  private timer: ReturnType<typeof setInterval> | undefined
  private runPromise: Promise<void> | undefined

  constructor({
    repository,
    lock,
    cleanup,
    intervalMs = DEFAULT_INTERVAL_MS,
    onError,
  }: RetentionCleanupWorkerDependencies) {
    this.repository = repository
    this.lock = lock
    this.cleanup = cleanup
    this.intervalMs = intervalMs
    this.onError = onError ?? ((error) => console.error('Retention cleanup worker failed', error))
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
    const lease = await this.lock.acquire('retention')
    if (lease === undefined) return
    try {
      await this.repository.refreshDueBoundaries(now)
      await this.repository.recoverInterrupted(now)
      if (this.cleanup === undefined) return
      const work = await this.repository.claimNext({ now })
      if (work === undefined) return
      try {
        const result =
          work.kind === 'derived'
            ? await this.cleanup.runDerived(work)
            : await this.cleanup.runBackup(work)
        if (result.completed) {
          await this.repository.succeed({ runId: work.runId, kind: work.kind, now })
        } else {
          await this.repository.advance({
            runId: work.runId,
            kind: work.kind,
            cursor: result.cursor,
            processedThrough: result.processedThrough,
            now,
          })
        }
      } catch (error) {
        await this.repository.fail({
          runId: work.runId,
          kind: work.kind,
          now,
          errorCode: 'CLEANUP_FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      await lease.release()
    }
  }
}
