import { generateId } from '@cimi/utils'
import type { LifecycleLock } from '@cimi/kernel'
import { reportLogEvent, type LogOperationContext } from '@cimi/logging'
import type { BackupRestoreRepository } from './repository.ts'

const DEFAULT_INTERVAL_MS = 1_000

export interface BackupRestoreCleanupPort {
  runDerived(input: { readonly operationId: string }): Promise<void>
  runBackup(input: { readonly operationId: string }): Promise<void>
}

export interface BackupRestoreCleanupWorkerDependencies {
  readonly repository: BackupRestoreRepository
  readonly lock: LifecycleLock
  readonly cleanup?: BackupRestoreCleanupPort | undefined
  readonly intervalMs?: number
  readonly clock?: (() => Date) | undefined
  readonly ownerToken?: (() => string) | undefined
  readonly onError?: ((error: unknown, context?: LogOperationContext) => unknown) | undefined
}

export class BackupRestoreCleanupWorker {
  private readonly repository: BackupRestoreRepository
  private readonly lock: LifecycleLock
  private readonly cleanup: BackupRestoreCleanupPort | undefined
  private readonly intervalMs: number
  private readonly clock: () => Date
  private readonly ownerToken: () => string
  private readonly onError: ((error: unknown, context?: LogOperationContext) => unknown) | undefined
  private timer: ReturnType<typeof setInterval> | undefined
  private runPromise: Promise<void> | undefined

  constructor({
    repository,
    lock,
    cleanup,
    intervalMs = DEFAULT_INTERVAL_MS,
    clock,
    ownerToken,
    onError,
  }: BackupRestoreCleanupWorkerDependencies) {
    this.repository = repository
    this.lock = lock
    this.cleanup = cleanup
    this.intervalMs = intervalMs
    this.clock = clock ?? (() => new Date())
    this.ownerToken = ownerToken ?? (() => generateId('own'))
    this.onError = onError
  }

  runOnce(): Promise<void> {
    if (this.runPromise !== undefined) return this.runPromise
    this.runPromise = this.process()
      .catch((error: unknown) =>
        this.reportError(error, { operation: 'backup.cleanup', stage: 'cleanup' }),
      )
      .finally(() => {
        this.runPromise = undefined
      })
    return this.runPromise
  }

  start(): void {
    if (this.cleanup === undefined || this.timer !== undefined) return
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs)
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

  private async process(): Promise<void> {
    if (this.cleanup === undefined) return
    let lease: Awaited<ReturnType<LifecycleLock['acquire']>> | undefined
    try {
      lease = await this.lock.acquire('cleanup')
    } catch (error) {
      this.reportError(error, { operation: 'backup.cleanup', stage: 'acquire' })
      return
    }
    if (lease === undefined) return
    let operationId: string | undefined
    try {
      const operation = await this.repository.findCleanupPending()
      if (operation === undefined) return
      operationId = operation.id
      const stage =
        operation.derivedCleanup.status === 'completed' ? 'backup_cleanup' : 'derived_cleanup'
      let ownerToken: string
      try {
        ownerToken = this.ownerToken()
      } catch (error) {
        this.reportError(error, { operation: 'backup.cleanup', stage: 'claim', operationId })
        return
      }
      let work
      try {
        work = await this.repository.claimCleanupStage({
          operationId: operation.id,
          stage,
          ownerToken,
          now: this.clock(),
        })
      } catch (error) {
        this.reportError(error, { operation: 'backup.cleanup', stage: 'claim', operationId })
        return
      }
      if (work === undefined) return
      try {
        if (work.stage === 'derived_cleanup') {
          await this.cleanup.runDerived({ operationId: work.operationId })
        } else {
          await this.cleanup.runBackup({ operationId: work.operationId })
        }
        await this.repository.completeCleanupStage({
          operationId: work.operationId,
          stage: work.stage,
          ownerToken,
          now: this.clock(),
        })
      } catch (error) {
        const context: LogOperationContext = {
          operation: 'backup.cleanup' as const,
          stage: work.stage === 'derived_cleanup' ? 'derived-cleanup' : 'backup-cleanup',
          operationId: work.operationId,
        }
        this.reportError(error, context)
        try {
          await this.repository.failCleanupStage({
            operationId: work.operationId,
            stage: work.stage,
            ownerToken,
            now: this.clock(),
            errorCode: 'INTERNAL_SERVER_ERROR',
          })
        } catch (failureError) {
          this.reportError(failureError, {
            operation: 'backup.cleanup',
            stage: 'record-failure',
            operationId: work.operationId,
          })
        }
      }
    } finally {
      try {
        await lease.release()
      } catch (error) {
        this.reportError(error, {
          operation: 'backup.cleanup',
          stage: 'release',
          ...(operationId === undefined ? {} : { operationId }),
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
