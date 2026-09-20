import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin } from '@cimi/guard'
import type {
  AcceptanceQuiescencePort,
  LifecycleAdmissionMode,
  LifecycleLease,
  LifecycleLock,
  ReadQuiescencePort,
} from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { reportLogEvent, type LogOperationContext } from '@cimi/logging'
import {
  BackupIncompatibilityError,
  InsufficientStorageError,
  SafetyArtifactChecksumMismatchError,
  SafetyArtifactUnavailableError,
  type BackupRestoreExecutor,
} from './executor.ts'
import type {
  BackupOperation,
  BackupRestoreRepository,
  SourceManifest,
  SafetyManifest,
  RestoringOperation,
} from './repository.ts'

export type BackupCreateInput = InferOutput<typeof schema.SBackupCreateInput>
export type BackupRestoreInput = InferOutput<typeof schema.SBackupRestoreInput>
export type BackupStatusInput = InferOutput<typeof schema.SBackupStatusInput>
export type BackupListInput = InferOutput<typeof schema.SBackupListInput>
export type BackupOutput = InferOutput<typeof schema.SBackup>
export type BackupListOutput = InferOutput<typeof schema.SBackupListOutput>

export interface BackupRestoreIdFactory {
  operationId(): string
  artifactId(): string
  ownerToken(): string
}

export interface BackupRestoreServiceDependencies {
  readonly repository: BackupRestoreRepository
  readonly executor: BackupRestoreExecutor
  readonly lock: LifecycleLock
  readonly acceptance: AcceptanceQuiescencePort
  readonly reads: ReadQuiescencePort
  readonly dataDirectoryReady: boolean | (() => boolean)
  readonly clock?: (() => Date) | undefined
  readonly ids?: BackupRestoreIdFactory | undefined
  readonly onError?: ((error: unknown, context?: LogOperationContext) => unknown) | undefined
}

export interface BackupRestoreHealthSnapshot {
  readonly admissionMode: LifecycleAdmissionMode
}

class OwnershipLostError extends Error {}

const CHECKPOINT_RANK: Record<BackupOperation['checkpoint'], number> = {
  none: 0,
  sqlite_captured: 1,
  sqlite_restored: 2,
  duckdb_rebuilt: 3,
  structurally_ready: 4,
}

export class BackupRestoreService {
  private readonly repository: BackupRestoreRepository
  private readonly executor: BackupRestoreExecutor
  private readonly lock: LifecycleLock
  private readonly acceptance: AcceptanceQuiescencePort
  private readonly reads: ReadQuiescencePort
  private readonly dataDirectoryReady: () => boolean
  private readonly clock: () => Date
  private readonly ids: BackupRestoreIdFactory
  private readonly onError: ((error: unknown, context?: LogOperationContext) => unknown) | undefined
  private readonly tasks = new Set<Promise<void>>()
  private pendingStarts = 0
  private readonly pendingStartWaiters = new Set<() => void>()

  constructor({
    repository,
    executor,
    lock,
    acceptance,
    reads,
    dataDirectoryReady,
    clock,
    ids,
    onError,
  }: BackupRestoreServiceDependencies) {
    this.repository = repository
    this.executor = executor
    this.lock = lock
    this.acceptance = acceptance
    this.reads = reads
    this.dataDirectoryReady =
      typeof dataDirectoryReady === 'function' ? dataDirectoryReady : () => dataDirectoryReady
    this.clock = clock ?? (() => new Date())
    this.ids = ids ?? {
      operationId: () => generateId('bop'),
      artifactId: () => generateId('bar'),
      ownerToken: () => generateId('own'),
    }
    this.onError = onError
  }

  async createBackup(_input: BackupCreateInput, user: AuthUser | undefined): Promise<BackupOutput> {
    assertAdmin(user)
    if (!this.dataDirectoryReady()) throw new ORPCError('CONFLICT', { status: 409 })
    const operationId = this.ids.operationId()
    const ownerToken = this.ids.ownerToken()
    this.beginStart()
    let lease: Awaited<ReturnType<LifecycleLock['acquire']>>
    try {
      lease = await this.lock.acquire('backup')
    } catch (error) {
      this.endStart()
      this.reportError(error, { operation: 'backup.create', stage: 'acquire', operationId })
      throw error
    }
    if (lease === undefined) {
      this.endStart()
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    let keepLease = false
    let admissionStopped = false
    try {
      const operation = await this.repository.beginBackup({
        operationId,
        ownerToken,
        now: this.clock(),
      })
      if (operation === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      const prepared = await this.prepareQuiescence({
        operation,
        ownerToken,
        restore: false,
        onAdmissionStopped: () => {
          admissionStopped = true
        },
      })
      keepLease = true
      this.startTask({
        operation: prepared,
        ownerToken,
        lease,
        admissionStopped,
        readsStopped: false,
      })
      return toPublicBackup(prepared)
    } catch (error) {
      if (admissionStopped) {
        try {
          await this.resumeAdmission({ readsStopped: false, admissionStopped })
        } catch (resumeError) {
          this.reportError(resumeError, { operation: 'backup.create', stage: 'resume-admission' })
        }
      }
      await this.failAfterAdmissionError(operationId, ownerToken, error, 'backup.create')
      throw toCommandError(error)
    } finally {
      try {
        if (!keepLease) await this.releaseLease(lease, 'backup.create', operationId)
      } finally {
        this.endStart()
      }
    }
  }

  async restoreBackup(
    input: BackupRestoreInput,
    user: AuthUser | undefined,
  ): Promise<BackupOutput> {
    assertAdmin(user)
    if (!this.dataDirectoryReady()) throw new ORPCError('CONFLICT', { status: 409 })
    const operationId = this.ids.operationId()
    const ownerToken = this.ids.ownerToken()
    this.beginStart()
    let source: SourceManifest | undefined
    try {
      source = await this.repository.findSourceManifest(input.backupId)
    } catch (error) {
      this.endStart()
      throw error
    }
    if (source === undefined) {
      this.endStart()
      throw new ORPCError('NOT_FOUND')
    }
    try {
      await this.preflight(source)
    } catch (error) {
      this.endStart()
      throw error
    }
    let lease: Awaited<ReturnType<LifecycleLock['acquire']>>
    try {
      lease = await this.lock.acquire('restore')
    } catch (error) {
      this.endStart()
      this.reportError(error, { operation: 'backup.restore', stage: 'acquire', operationId })
      throw error
    }
    if (lease === undefined) {
      this.endStart()
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    let keepLease = false
    let admissionStopped = false
    let readsStopped = false
    try {
      const operation = await this.repository.beginRestore({
        operationId,
        ownerToken,
        sourceBackupId: input.backupId,
        now: this.clock(),
      })
      if (operation === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      const prepared = await this.prepareQuiescence({
        operation,
        ownerToken,
        restore: true,
        onAdmissionStopped: () => {
          admissionStopped = true
        },
        onReadsStopped: () => {
          readsStopped = true
        },
      })
      keepLease = true
      this.startTask({
        operation: prepared,
        ownerToken,
        lease,
        admissionStopped,
        readsStopped,
      })
      return toPublicBackup(prepared)
    } catch (error) {
      try {
        await this.resumeAdmission({ readsStopped, admissionStopped })
      } catch (resumeError) {
        this.reportError(resumeError, { operation: 'backup.restore', stage: 'resume-admission' })
      }
      await this.failAfterAdmissionError(operationId, ownerToken, error, 'backup.restore')
      throw toCommandError(error)
    } finally {
      try {
        if (!keepLease) await this.releaseLease(lease, 'backup.restore', operationId)
      } finally {
        this.endStart()
      }
    }
  }

  async getStatus(input: BackupStatusInput, user: AuthUser | undefined): Promise<BackupOutput> {
    assertAdmin(user)
    const operation = await this.repository.find(input.backupId)
    if (operation === undefined) throw new ORPCError('NOT_FOUND')
    return toPublicBackup(operation)
  }

  async list(input: BackupListInput, user: AuthUser | undefined): Promise<BackupListOutput> {
    assertAdmin(user)
    const page = await this.repository.list({ offset: input.offset ?? 0, limit: input.limit ?? 20 })
    return {
      items: page.items.map(toPublicBackup),
      nextOffset: page.nextOffset,
      hasMore: page.hasMore,
      totalCount: page.totalCount,
    }
  }

  async getSnapshot(): Promise<BackupRestoreHealthSnapshot> {
    const operation = await this.repository.findActive()
    return {
      admissionMode:
        operation?.operationType === 'restore'
          ? 'restore-read-write-quiesced'
          : operation?.operationType === 'backup'
            ? 'backup-write-quiesced'
            : 'normal',
    }
  }

  async resumeOnStartup(): Promise<void> {
    const operation = await this.repository.findActive()
    if (operation === undefined) return
    let ownerToken: string
    try {
      ownerToken = this.ids.ownerToken()
    } catch (error) {
      this.reportError(error, {
        operation: operationLogName(operation.operationType),
        stage: 'startup',
        operationId: operation.id,
      })
      return
    }
    let lease: Awaited<ReturnType<LifecycleLock['acquire']>>
    try {
      lease = await this.lock.acquire(operation.operationType)
    } catch (error) {
      this.reportError(error, {
        operation: operationLogName(operation.operationType),
        stage: 'acquire',
        operationId: operation.id,
      })
      return
    }
    if (lease === undefined) return
    let keepLease = false
    let admissionStopped = false
    let readsStopped = false
    let claimed: BackupOperation | undefined
    try {
      claimed = await this.repository.claim({
        operationId: operation.id,
        expectedUpdatedAt: operation.updatedAt,
        ownerToken,
        now: this.clock(),
      })
      if (claimed === undefined) return
      const prepared = await this.prepareQuiescence({
        operation: claimed,
        ownerToken,
        restore: claimed.operationType === 'restore',
        onAdmissionStopped: () => {
          admissionStopped = true
        },
        onReadsStopped: () => {
          readsStopped = true
        },
      })
      keepLease = true
      this.startTask({
        operation: prepared,
        ownerToken,
        lease,
        admissionStopped,
        readsStopped,
      })
    } catch (error) {
      try {
        await this.resumeAdmission({ readsStopped, admissionStopped })
      } catch (resumeError) {
        const operationContext = {
          operation: operationLogName(claimed?.operationType ?? operation.operationType),
          stage: 'resume-admission' as const,
          operationId: claimed?.id ?? operation.id,
        }
        this.reportError(resumeError, {
          ...operationContext,
        })
      }
      if (claimed !== undefined) {
        const context = {
          operation: operationLogName(claimed.operationType),
          stage: 'startup' as const,
          operationId: claimed.id,
        }
        this.reportError(error, context)
        try {
          await this.recordFailure(claimed.id, ownerToken, error, undefined, context)
        } catch (failureError) {
          this.reportError(failureError, {
            operation: operationLogName(claimed.operationType),
            stage: 'record-failure',
            operationId: claimed.id,
          })
        }
      } else {
        this.reportError(error, {
          operation: operationLogName(operation.operationType),
          stage: 'startup',
          operationId: operation.id,
        })
      }
    } finally {
      if (!keepLease) {
        try {
          await lease.release()
        } catch (error) {
          this.reportError(error, {
            operation: operationLogName(operation.operationType),
            stage: 'release',
            operationId: operation.id,
          })
        }
      }
    }
  }

  async start(): Promise<void> {
    await this.resumeOnStartup()
  }

  async stop(): Promise<void> {
    await this.waitForPendingStarts()
    await Promise.all(this.tasks)
  }

  private async prepareQuiescence(input: {
    readonly operation: BackupOperation
    readonly ownerToken: string
    readonly restore: boolean
    readonly onAdmissionStopped: () => void
    readonly onReadsStopped?: (() => void) | undefined
  }): Promise<BackupOperation> {
    input.onAdmissionStopped()
    await this.acceptance.stopAdmission()
    const safeSequence = await this.acceptance.drain()
    let operation = await this.repository.advance({
      operationId: input.operation.id,
      ownerToken: input.ownerToken,
      phase: input.operation.phase,
      checkpoint: input.operation.checkpoint,
      progress: input.operation.progress,
      lastSafeSequence: safeSequence.lastSafeSequence,
      now: this.clock(),
    })
    if (operation === undefined) throw new OwnershipLostError('Backup operation ownership was lost')
    if (input.restore) {
      input.onReadsStopped?.()
      await this.reads.stopReads()
      await this.reads.drain()
    }
    return operation
  }

  private startTask(input: {
    readonly operation: BackupOperation
    readonly ownerToken: string
    readonly lease: { release(): void | PromiseLike<void> }
    readonly admissionStopped: boolean
    readonly readsStopped: boolean
  }): void {
    let task: Promise<void>
    task = this.execute(input.operation, input.ownerToken)
      .catch((error) =>
        this.reportError(error, {
          operation: operationLogName(input.operation.operationType),
          stage: 'execute',
          operationId: input.operation.id,
        }),
      )
      .finally(async () => {
        try {
          if (input.readsStopped) await this.reads.resumeReads()
        } catch (error) {
          this.reportError(error, {
            operation: operationLogName(input.operation.operationType),
            stage: 'resume-reads',
            operationId: input.operation.id,
          })
        }
        try {
          if (input.admissionStopped) await this.acceptance.resumeAdmission()
        } catch (error) {
          this.reportError(error, {
            operation: operationLogName(input.operation.operationType),
            stage: 'resume-admission',
            operationId: input.operation.id,
          })
        }
        try {
          await input.lease.release()
        } catch (error) {
          this.reportError(error, {
            operation: operationLogName(input.operation.operationType),
            stage: 'release',
            operationId: input.operation.id,
          })
        }
        this.tasks.delete(task)
      })
    this.tasks.add(task)
  }

  private async execute(operation: BackupOperation, ownerToken: string): Promise<void> {
    if (operation.operationType === 'backup') {
      await this.executeBackup(operation, ownerToken)
      return
    }
    await this.executeRestore(operation, ownerToken)
  }

  private async executeBackup(operation: BackupOperation, ownerToken: string): Promise<void> {
    let ownershipLost = false
    try {
      if (operation.status !== 'creating') return
      let artifact = await this.repository.findAuthoritativeArtifact(operation.id)
      if (artifact === undefined) {
        artifact = await this.executor.captureBackup({
          operationId: operation.id,
          artifactId: this.ids.artifactId(),
          lastSafeSequence: operation.lastSafeSequence ?? 0,
        })
        const recorded = await this.repository.recordBackupArtifact({
          operationId: operation.id,
          ownerToken,
          artifact,
          now: this.clock(),
        })
        if (recorded === undefined) {
          ownershipLost = true
          throw new OwnershipLostError('Backup operation ownership was lost')
        }
      }
      const completed = await this.repository.complete({
        operationId: operation.id,
        ownerToken,
        now: this.clock(),
      })
      if (completed === undefined) ownershipLost = true
    } catch (error) {
      if (!ownershipLost) {
        const context = {
          operation: 'backup.create' as const,
          stage: 'capture' as const,
          operationId: operation.id,
        }
        this.reportError(error, context)
        try {
          await this.recordFailure(
            operation.id,
            ownerToken,
            error,
            undefined,
            context,
            'BACKUP_FAILED',
          )
        } catch (failureError) {
          this.reportError(failureError, {
            operation: 'backup.create',
            stage: 'record-failure',
            operationId: operation.id,
          })
        }
      }
    }
  }

  private async executeRestore(operation: BackupOperation, ownerToken: string): Promise<void> {
    let safety: SafetyManifest | undefined
    let ownershipLost = false
    try {
      if (operation.operationType !== 'restore') return
      if (operation.status !== 'creating' && operation.status !== 'restoring') return
      if (operation.restoreSourceBackupId === null)
        throw new OwnershipLostError('Restore source was lost')
      const source = await this.repository.findSourceManifest(operation.restoreSourceBackupId)
      if (source === undefined) throw new ORPCError('NOT_FOUND')
      await this.executor.validateManifest({ operationId: operation.id, source })
      safety = await this.repository.findSafetyArtifact(operation.id)
      if (safety === undefined) {
        safety = await this.executor.createPreRestoreSafety({
          operationId: operation.id,
          artifactId: this.ids.artifactId(),
          lastSafeSequence: operation.lastSafeSequence ?? 0,
        })
        const recorded = await this.repository.recordSafetyArtifact({
          operationId: operation.id,
          ownerToken,
          artifact: safety,
          now: this.clock(),
        })
        if (recorded === undefined) {
          ownershipLost = true
          throw new OwnershipLostError('Restore operation ownership was lost')
        }
      }
      let current = await this.repository.find(operation.id)
      if (
        current === undefined ||
        current.operationType !== 'restore' ||
        (current.status !== 'creating' && current.status !== 'restoring')
      ) {
        throw new OwnershipLostError('Restore state was lost')
      }
      if (CHECKPOINT_RANK[current.checkpoint] < CHECKPOINT_RANK.sqlite_restored) {
        await this.executor.restoreSqlite({ operationId: operation.id, source })
        current = await this.advanceRestore(
          current,
          ownerToken,
          'rebuilding_duckdb',
          'sqlite_restored',
          0.6,
        )
      }
      if (CHECKPOINT_RANK[current.checkpoint] < CHECKPOINT_RANK.duckdb_rebuilt) {
        await this.executor.migrate({ operationId: operation.id })
        await this.executor.rebuildAnalytics({ operationId: operation.id })
        current = await this.advanceRestore(
          current,
          ownerToken,
          'rebuilding_duckdb',
          'duckdb_rebuilt',
          0.9,
        )
      }
      if (CHECKPOINT_RANK[current.checkpoint] < CHECKPOINT_RANK.structurally_ready) {
        await this.executor.verifyStructuralReadiness({ operationId: operation.id })
        current = await this.advanceRestore(current, ownerToken, 'ready', 'structurally_ready', 1)
      }
      const completed = await this.repository.complete({
        operationId: operation.id,
        ownerToken,
        now: this.clock(),
      })
      if (completed === undefined) ownershipLost = true
    } catch (error) {
      if (!ownershipLost) {
        const context = {
          operation: 'backup.restore' as const,
          stage: 'restore' as const,
          operationId: operation.id,
        }
        this.reportError(error, context)
        try {
          await this.recordFailure(operation.id, ownerToken, error, safety, context)
        } catch (failureError) {
          this.reportError(failureError, {
            operation: 'backup.restore',
            stage: 'record-failure',
            operationId: operation.id,
          })
        }
      }
    }
  }

  private async advanceRestore(
    operation: BackupOperation,
    ownerToken: string,
    phase: 'rebuilding_duckdb' | 'ready',
    checkpoint: 'sqlite_restored' | 'duckdb_rebuilt' | 'structurally_ready',
    progress: number,
  ): Promise<RestoringOperation> {
    const advanced = await this.repository.advance({
      operationId: operation.id,
      ownerToken,
      phase,
      checkpoint,
      progress,
      lastSafeSequence: operation.lastSafeSequence,
      now: this.clock(),
    })
    if (
      advanced === undefined ||
      advanced.operationType !== 'restore' ||
      advanced.status !== 'restoring'
    ) {
      throw new OwnershipLostError('Restore operation ownership was lost')
    }
    return advanced
  }

  private async recordFailure(
    operationId: string,
    ownerToken: string,
    error: unknown,
    safety: SafetyManifest | undefined,
    context: LogOperationContext,
    fallbackErrorCode: 'BACKUP_FAILED' | 'INTERNAL_SERVER_ERROR' = 'INTERNAL_SERVER_ERROR',
  ): Promise<void> {
    if (error instanceof OwnershipLostError) return
    if (safety !== undefined) {
      try {
        await this.executor.rollback({ operationId, safety })
      } catch (rollbackError) {
        this.reportError(rollbackError, {
          operation: context.operation,
          stage: 'rollback',
          operationId,
        })
        await this.repository.fail({
          operationId,
          ownerToken,
          errorCode: 'INTERNAL_SERVER_ERROR',
          now: this.clock(),
          recoveryRequired: true,
        })
        return
      }
    }
    await this.repository.fail({
      operationId,
      ownerToken,
      errorCode: errorCodeFor(error, fallbackErrorCode),
      now: this.clock(),
    })
  }

  private async failAfterAdmissionError(
    operationId: string,
    ownerToken: string,
    error: unknown,
    operation: 'backup.create' | 'backup.restore',
  ): Promise<void> {
    if (error instanceof ORPCError && error.code === 'CONFLICT') return
    this.reportError(error, { operation, stage: 'admission', operationId })
    try {
      await this.repository.fail({
        operationId,
        ownerToken,
        errorCode: errorCodeFor(error, 'INTERNAL_SERVER_ERROR'),
        now: this.clock(),
      })
    } catch (failureError) {
      this.reportError(failureError, { operation, stage: 'record-failure', operationId })
      return
    }
  }

  private async resumeAdmission(input: {
    readonly readsStopped: boolean
    readonly admissionStopped: boolean
  }): Promise<void> {
    const errors: unknown[] = []
    if (input.readsStopped) {
      try {
        await this.reads.resumeReads()
      } catch (error) {
        errors.push(error)
      }
    }
    if (input.admissionStopped) {
      try {
        await this.acceptance.resumeAdmission()
      } catch (error) {
        errors.push(error)
      }
    }
    if (errors.length > 0) throw new AggregateError(errors, 'Failed to resume backup admission')
  }

  private beginStart(): void {
    this.pendingStarts += 1
  }

  private endStart(): void {
    this.pendingStarts -= 1
    if (this.pendingStarts !== 0) return
    for (const resolve of this.pendingStartWaiters) resolve()
    this.pendingStartWaiters.clear()
  }

  private async waitForPendingStarts(): Promise<void> {
    if (this.pendingStarts === 0) return
    await new Promise<void>((resolve) => this.pendingStartWaiters.add(resolve))
  }

  private async releaseLease(
    lease: LifecycleLease,
    operation: 'backup.create' | 'backup.restore',
    operationId: string,
  ): Promise<void> {
    try {
      await lease.release()
    } catch (error) {
      this.reportError(error, { operation, stage: 'release', operationId })
      throw error
    }
  }

  private async preflight(source: SourceManifest): Promise<void> {
    try {
      await this.executor.validateManifest({ operationId: source.operationId, source })
    } catch (error) {
      throw toCommandError(error)
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

function assertAdmin(user: AuthUser | undefined): void {
  assertInstallationAdmin(user)
}

function errorCodeFor(
  error: unknown,
  fallback: 'BACKUP_FAILED' | 'INTERNAL_SERVER_ERROR',
):
  | 'BACKUP_FAILED'
  | 'INCOMPATIBLE_BACKUP'
  | 'INSUFFICIENT_STORAGE'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR' {
  if (error instanceof BackupIncompatibilityError) return 'INCOMPATIBLE_BACKUP'
  if (error instanceof InsufficientStorageError) return 'INSUFFICIENT_STORAGE'
  if (error instanceof SafetyArtifactUnavailableError) return 'INSUFFICIENT_STORAGE'
  if (error instanceof SafetyArtifactChecksumMismatchError) return 'INTERNAL_SERVER_ERROR'
  if (error instanceof ORPCError && error.code === 'CONFLICT') return 'CONFLICT'
  return fallback
}

function operationLogName(
  operationType: BackupOperation['operationType'] | undefined,
): 'backup.create' | 'backup.restore' {
  return operationType === 'restore' ? 'backup.restore' : 'backup.create'
}

function toCommandError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error
  if (
    error instanceof BackupIncompatibilityError ||
    (error instanceof Error && /incompatible|newer|unsupported|manifest/i.test(error.message))
  ) {
    return new ORPCError('INCOMPATIBLE_BACKUP', { status: 422 })
  }
  if (error instanceof InsufficientStorageError) {
    return new ORPCError('INSUFFICIENT_STORAGE', { status: 507 })
  }
  if (error instanceof SafetyArtifactUnavailableError) {
    return new ORPCError('INSUFFICIENT_STORAGE', { status: 507 })
  }
  return new ORPCError('INTERNAL_SERVER_ERROR', { status: 500 })
}

function toPublicBackup(operation: BackupOperation): BackupOutput {
  return {
    id: operation.id,
    status: operation.status,
    createdAt: operation.createdAt.toISOString(),
    completedAt: operation.completedAt?.toISOString() ?? null,
    scope: operation.scope,
    phase: operation.phase,
    progress: operation.progress,
    checkpoint: operation.checkpoint,
    lastSafeSequence: operation.lastSafeSequence,
    readiness: operation.readiness,
    cleanupPending: operation.cleanupPending,
    derivedCleanup: toPublicCleanup(operation.derivedCleanup),
    backupCleanup: toPublicCleanup(operation.backupCleanup),
    restoreSourceBackupId: operation.restoreSourceBackupId,
    preRestoreSafetyArtifact: toPublicSafety(operation.preRestoreSafetyArtifact),
    errorCode: operation.errorCode,
  }
}

function toPublicCleanup(stage: BackupOperation['derivedCleanup']): BackupOutput['derivedCleanup'] {
  return {
    status: stage.status,
    startedAt: stage.startedAt?.toISOString() ?? null,
    completedAt: stage.completedAt?.toISOString() ?? null,
    errorCode: stage.errorCode,
  }
}

function toPublicSafety(safety: SafetyManifest | null): BackupOutput['preRestoreSafetyArtifact'] {
  if (safety === null) return null
  return {
    id: safety.id,
    createdAt: safety.createdAt.toISOString(),
    status: safety.status,
    lastSafeSequence: safety.lastSafeSequence,
    errorCode: safety.errorCode,
  }
}
