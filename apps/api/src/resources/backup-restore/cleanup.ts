import { generateId } from '@cimi/utils'
import type { LifecycleLock } from '@cimi/kernel'
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
  readonly onError?: ((error: unknown) => void) | undefined
}

export class BackupRestoreCleanupWorker {
  private readonly repository: BackupRestoreRepository
  private readonly lock: LifecycleLock
  private readonly cleanup: BackupRestoreCleanupPort | undefined
  private readonly intervalMs: number
  private readonly clock: () => Date
  private readonly ownerToken: () => string
  private readonly onError: (error: unknown) => void
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
    this.onError = onError ?? ((error) => console.error('Backup cleanup worker failed', error))
  }

  runOnce(): Promise<void> {
    if (this.runPromise !== undefined) return this.runPromise
    this.runPromise = this.process()
      .catch((error: unknown) => this.onError(error))
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
    const lease = await this.lock.acquire('cleanup')
    if (lease === undefined) return
    try {
      const operation = await this.repository.findCleanupPending()
      if (operation === undefined) return
      const stage =
        operation.derivedCleanup.status === 'completed' ? 'backup_cleanup' : 'derived_cleanup'
      const ownerToken = this.ownerToken()
      const work = await this.repository.claimCleanupStage({
        operationId: operation.id,
        stage,
        ownerToken,
        now: this.clock(),
      })
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
        await this.repository.failCleanupStage({
          operationId: work.operationId,
          stage: work.stage,
          ownerToken,
          now: this.clock(),
          errorCode: 'INTERNAL_SERVER_ERROR',
        })
        throw error
      }
    } finally {
      await lease.release()
    }
  }
}
