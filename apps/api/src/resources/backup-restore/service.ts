import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin } from '@cimi/guard'
import type {
  AcceptanceQuiescencePort,
  LifecycleAdmissionMode,
  LifecycleLock,
  ReadQuiescencePort,
} from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
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
  readonly onError?: ((error: unknown) => void) | undefined
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
  private readonly onError: (error: unknown) => void
  private readonly tasks = new Set<Promise<void>>()

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
    this.onError = onError ?? (() => undefined)
  }

  async createBackup(_input: BackupCreateInput, user: AuthUser | undefined): Promise<BackupOutput> {
    assertAdmin(user)
    if (!this.dataDirectoryReady()) throw new ORPCError('CONFLICT', { status: 409 })
    const lease = await this.lock.acquire('backup')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    const operationId = this.ids.operationId()
    const ownerToken = this.ids.ownerToken()
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
      if (admissionStopped) await this.resumeAdmission(false)
      await this.failAfterAdmissionError(operationId, ownerToken, error)
      throw toCommandError(error)
    } finally {
      if (!keepLease) await lease.release()
    }
  }

  async restoreBackup(
    input: BackupRestoreInput,
    user: AuthUser | undefined,
  ): Promise<BackupOutput> {
    assertAdmin(user)
    if (!this.dataDirectoryReady()) throw new ORPCError('CONFLICT', { status: 409 })
    const source = await this.repository.findSourceManifest(input.backupId)
    if (source === undefined) throw new ORPCError('NOT_FOUND')
    await this.preflight(source)
    const lease = await this.lock.acquire('restore')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    const operationId = this.ids.operationId()
    const ownerToken = this.ids.ownerToken()
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
      if (readsStopped) await this.resumeAdmission(true)
      else if (admissionStopped) await this.resumeAdmission(false)
      await this.failAfterAdmissionError(operationId, ownerToken, error)
      throw toCommandError(error)
    } finally {
      if (!keepLease) await lease.release()
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
    const lease = await this.lock.acquire(operation.operationType)
    if (lease === undefined) return
    const ownerToken = this.ids.ownerToken()
    let keepLease = false
    let admissionStopped = false
    let readsStopped = false
    try {
      const claimed = await this.repository.claim({
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
      if (readsStopped) await this.resumeAdmission(true)
      else if (admissionStopped) await this.resumeAdmission(false)
      this.onError(error)
    } finally {
      if (!keepLease) await lease.release()
    }
  }

  async start(): Promise<void> {
    await this.resumeOnStartup()
  }

  async stop(): Promise<void> {
    await Promise.all(this.tasks)
  }

  private async prepareQuiescence(input: {
    readonly operation: BackupOperation
    readonly ownerToken: string
    readonly restore: boolean
    readonly onAdmissionStopped: () => void
    readonly onReadsStopped?: (() => void) | undefined
  }): Promise<BackupOperation> {
    await this.acceptance.stopAdmission()
    input.onAdmissionStopped()
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
      await this.reads.stopReads()
      input.onReadsStopped?.()
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
      .catch((error) => this.onError(error))
      .finally(async () => {
        this.tasks.delete(task)
        if (input.readsStopped) await this.reads.resumeReads()
        if (input.admissionStopped) await this.acceptance.resumeAdmission()
        await input.lease.release()
      })
    this.tasks.add(task)
    void task.catch(() => undefined)
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
        await this.recordFailure(operation.id, ownerToken, error, undefined, 'BACKUP_FAILED')
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
      if (!ownershipLost) await this.recordFailure(operation.id, ownerToken, error, safety)
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
    fallbackErrorCode: 'BACKUP_FAILED' | 'INTERNAL_SERVER_ERROR' = 'INTERNAL_SERVER_ERROR',
  ): Promise<void> {
    if (error instanceof OwnershipLostError) return
    if (safety !== undefined) {
      try {
        await this.executor.rollback({ operationId, safety })
      } catch {
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
  ): Promise<void> {
    if (error instanceof ORPCError && error.code === 'CONFLICT') return
    try {
      await this.repository.fail({
        operationId,
        ownerToken,
        errorCode: errorCodeFor(error, 'INTERNAL_SERVER_ERROR'),
        now: this.clock(),
      })
    } catch {
      return
    }
  }

  private async resumeAdmission(restore: boolean): Promise<void> {
    if (restore) await this.reads.resumeReads()
    await this.acceptance.resumeAdmission()
  }

  private async preflight(source: SourceManifest): Promise<void> {
    try {
      await this.executor.validateManifest({ operationId: source.operationId, source })
    } catch (error) {
      throw toCommandError(error)
    }
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
