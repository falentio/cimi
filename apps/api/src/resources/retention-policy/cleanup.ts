import type { LifecycleLock } from '@cimi/kernel'
import { reportLogEvent, type LogOperationContext } from '@cimi/logging'
import type { RetentionPolicyRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000

export interface RetentionCleanupBatchResult {
  completed: boolean
  cursor: string | null
  processedThrough: Date | null
}

export interface RetentionCleanupPort {
  runIdentityDerived?(input: { now: Date }): Promise<void>
  runIdentityBackup?(input: { now: Date }): Promise<void>
  runDerived(input: {
    runId: string
    siteId: string
    now: Date
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult>
  runBackup(input: {
    runId: string
    siteId: string
    now: Date
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult>
}

export interface RetentionCleanupWorkerDependencies {
  repository: RetentionPolicyRepository
  lock: LifecycleLock
  cleanup?: RetentionCleanupPort | undefined
  intervalMs?: number
  onError?: (error: unknown, context?: LogOperationContext) => unknown
}

export class RetentionCleanupWorker {
  private readonly repository: RetentionPolicyRepository
  private readonly lock: LifecycleLock
  private cleanup: RetentionCleanupPort | undefined
  private readonly intervalMs: number
  private readonly onError: ((error: unknown, context?: LogOperationContext) => unknown) | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private timerGeneration = 0
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
    this.onError = onError
  }

  setCleanupPort(cleanup: RetentionCleanupPort | undefined): void {
    this.cleanup = cleanup
  }

  runOnce(now = new Date()): Promise<void> {
    if (this.runPromise !== undefined) return this.runPromise
    this.runPromise = this.process(now)
      .catch((error: unknown) =>
        this.reportError(error, { operation: 'retention.cleanup', stage: 'scan' }),
      )
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
    let lease: Awaited<ReturnType<LifecycleLock['acquire']>> | undefined
    try {
      lease = await this.lock.acquire('retention')
    } catch (error) {
      this.reportError(error, { operation: 'retention.cleanup', stage: 'acquire' })
      return
    }
    if (lease === undefined) return
    let runId: string | undefined
    let siteId: string | undefined
    try {
      await this.repository.refreshDueBoundaries(now)
      await this.repository.recoverInterrupted(now)
      if (this.cleanup === undefined) return
      if (this.cleanup.runIdentityDerived !== undefined) {
        await this.cleanup.runIdentityDerived({ now })
      }
      if (this.cleanup.runIdentityBackup !== undefined) {
        await this.cleanup.runIdentityBackup({ now })
      }
      let work
      try {
        work = await this.repository.claimNext({ now })
      } catch (error) {
        this.reportError(error, { operation: 'retention.cleanup', stage: 'claim' })
        return
      }
      if (work === undefined) return
      runId = work.runId
      siteId = work.siteId
      try {
        const result =
          work.kind === 'derived'
            ? await this.cleanup.runDerived({ ...work, now })
            : await this.cleanup.runBackup({ ...work, now })
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
        const context: LogOperationContext = {
          operation: 'retention.cleanup' as const,
          stage: work.kind === 'derived' ? 'derived-cleanup' : 'backup-cleanup',
          runId: work.runId,
          siteId: work.siteId,
        }
        this.reportError(error, context)
        try {
          await this.repository.fail({
            runId: work.runId,
            kind: work.kind,
            now,
            errorCode: 'CLEANUP_FAILED',
            errorMessage: error instanceof Error ? error.message : String(error),
          })
        } catch (failureError) {
          this.reportError(failureError, {
            operation: 'retention.cleanup',
            stage: 'record-failure',
            runId: work.runId,
            siteId: work.siteId,
          })
        }
      }
    } finally {
      try {
        await lease.release()
      } catch (error) {
        this.reportError(error, {
          operation: 'retention.cleanup',
          stage: 'release',
          ...(runId === undefined ? {} : { runId }),
          ...(siteId === undefined ? {} : { siteId }),
        })
      }
    }
  }

  private reportError(error: unknown, context: LogOperationContext): void {
    if (this.onError === undefined) {
      reportLogEvent({ kind: 'operation.failure', ...context, error })
      return
    }
    try {
      void Promise.resolve(this.onError(error, context)).catch(() => undefined)
    } catch {}
  }
}
