import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin } from '@cimi/guard'
import type {
  AcceptanceJournalPort,
  LifecycleLease,
  LifecycleLock,
  LifecycleOperationStatus,
  LifecycleOperationStatusReader,
  StoreHealth,
} from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { InstallationRepository } from './repository.ts'
import {
  assertSafeOperationId,
  InsufficientStorageError,
  SafetyArtifactChecksumMismatchError,
  SafetyArtifactUnavailableError,
  UpgradeIncompatibilityError,
} from './upgrade-executor.ts'

export type InstallationInitializeInput = InferOutput<typeof schema.SInstallationInitializeFields>
export type InstallationInitializeOutput =
  | { status: 201; body: InstallationRepository.Installation }
  | { status: 200; body: InstallationRepository.Installation }
export type InstallationUpgradeInput = { confirmation: 'UPGRADE' }
export type InstallationUpgradeOutput = InstallationRepository.Installation
export type InstallationStatusOutput = InstallationRepository.Installation
export type DataDirectoryReadiness = boolean | (() => boolean)

export interface UpgradeExecutor {
  createSafetyArtifact(input: {
    operationId: string
    artifactId: string
  }): Promise<InstallationRepository.SafetyArtifactInput>
  migrate(input: { operationId: string }): Promise<void>
  rebuildAnalytics(input: { operationId: string }): Promise<void>
  rollback(input: {
    operationId: string
    artifact: InstallationRepository.SafetyArtifactInput
  }): Promise<void>
}

export interface InstallationIdFactory {
  installationId(): string
  retentionPolicyId(): string
  operationId(): string
  artifactId(): string
}

export interface InstallationServiceDependencies {
  repository: InstallationRepository
  lock: LifecycleLock
  journal: AcceptanceJournalPort
  dataDirectoryReady: DataDirectoryReadiness
  clock?: (() => Date) | undefined
  ids?: InstallationIdFactory | undefined
  upgradeExecutor: UpgradeExecutor
}

const ALLOWED_TRANSITIONS: Record<
  InstallationRepository.Status,
  readonly InstallationRepository.Status[]
> = {
  uninitialized: ['ready'],
  ready: ['maintenance', 'recovering', 'degraded'],
  degraded: ['ready', 'maintenance', 'recovering'],
  maintenance: ['ready', 'recovering', 'degraded'],
  recovering: ['ready', 'maintenance', 'degraded'],
}

function canTransition(
  from: InstallationRepository.Status,
  to: InstallationRepository.Status,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}

function isCleanupPending(status: InstallationRepository.CleanupStage['status']): boolean {
  return status !== 'not_applicable' && status !== 'completed'
}

function isTerminal(operation: InstallationRepository.ActiveOperation | null): boolean {
  return operation !== null && operation.errorCode !== null
}

function assertInstallationCoherent(record: InstallationRepository.Record): void {
  if (record.status === 'ready' && !record.dataDirectoryReady) {
    throw new Error('Installation is not ready without a data directory')
  }
  const pending =
    isCleanupPending(record.derivedCleanup.status) || isCleanupPending(record.backupCleanup.status)
  if (record.cleanupPending !== pending) throw new Error('Installation cleanup flags disagree')
  if (
    record.backupCleanup.status !== 'not_applicable' &&
    record.backupCleanup.status !== 'not_started' &&
    record.backupCleanup.status !== 'pending' &&
    record.derivedCleanup.status !== 'completed'
  ) {
    throw new Error('Installation backup cleanup started before derived cleanup completed')
  }
  if (
    record.status === 'degraded' &&
    record.activeOperation !== null &&
    !isTerminal(record.activeOperation)
  ) {
    throw new Error('Degraded installation without terminal operation')
  }
}

export interface InstallationHealthSnapshot {
  installationStatus: InstallationRepository.Status
  cleanupPending: boolean
  controlStore?: StoreHealth
  analyticsStore?: StoreHealth
}

export class InstallationService implements LifecycleOperationStatusReader {
  private readonly repository: InstallationRepository
  private readonly lock: LifecycleLock
  private readonly journal: AcceptanceJournalPort
  private readonly dataDirectoryReady: () => boolean
  private readonly clock: () => Date
  private readonly ids: InstallationIdFactory
  private readonly upgradeExecutor: UpgradeExecutor
  private upgradeLease: LifecycleLease | undefined
  private upgradeTask: Promise<void> | undefined

  constructor({
    repository,
    lock,
    journal,
    dataDirectoryReady,
    clock,
    ids,
    upgradeExecutor,
  }: InstallationServiceDependencies) {
    this.repository = repository
    this.lock = lock
    this.journal = journal
    this.dataDirectoryReady =
      typeof dataDirectoryReady === 'function' ? dataDirectoryReady : () => dataDirectoryReady
    this.clock = clock ?? (() => new Date())
    this.ids = ids ?? {
      installationId: () => generateId('ins'),
      retentionPolicyId: () => generateId('rtn'),
      operationId: () => generateId('bop'),
      artifactId: () => generateId('bar'),
    }
    this.upgradeExecutor = upgradeExecutor
  }

  async initialize(
    input: InstallationInitializeInput,
    user: AuthUser,
  ): Promise<InstallationInitializeOutput> {
    assertInstallationAdmin(user)
    const lease = await this.lock.acquire('initialization')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      const dataDirectoryReady = this.dataDirectoryReady()
      if (!dataDirectoryReady) throw new ORPCError('CONFLICT', { status: 409 })
      const existing = await this.repository.find()
      if (existing !== undefined) {
        return this.reuseExisting(existing, input.defaultRetention, dataDirectoryReady)
      }
      try {
        const now = this.clock()
        const created = await this.repository.insert({
          id: this.ids.installationId(),
          retentionPolicyId: this.ids.retentionPolicyId(),
          eventMonths: input.defaultRetention.eventMonths,
          profileMonths: input.defaultRetention.profileMonths,
          replayMonths: input.defaultRetention.replayMonths,
          dataDirectoryReady,
          createdAt: now,
          updatedAt: now,
        })
        return { status: 201, body: toPublicInstallation(created) }
      } catch (error) {
        if (!isConstraintError(error)) throw error
        const raced = await this.repository.find()
        if (raced === undefined) throw error
        return this.reuseExisting(raced, input.defaultRetention, dataDirectoryReady)
      }
    } finally {
      await lease.release()
    }
  }

  async getStatus(user: AuthUser): Promise<InstallationStatusOutput> {
    assertInstallationAdmin(user)
    const record = await this.repository.find()
    if (record === undefined) throw new ORPCError('NOT_FOUND')
    assertInstallationCoherent(record)
    return toPublicInstallation(record)
  }

  async upgrade(
    input: InstallationUpgradeInput,
    user: AuthUser,
  ): Promise<InstallationUpgradeOutput> {
    assertInstallationAdmin(user)
    const lease = await this.lock.acquire('upgrade')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    let retainLease = false
    try {
      if (!this.dataDirectoryReady()) throw new ORPCError('CONFLICT', { status: 409 })
      const existing = await this.repository.find()
      if (existing === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      assertInstallationCoherent(existing)
      if (existing.activeOperation !== null && !isTerminal(existing.activeOperation)) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      if (!canTransition(existing.status, 'maintenance')) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      const now = this.clock()
      const operationId = this.ids.operationId()
      assertSafeOperationId(operationId)
      const ownerToken = generateId('own')
      let record: InstallationRepository.Record
      try {
        record = await this.repository.beginUpgrade({
          operationId,
          ownerToken,
          activeOperation: {
            phase: 'pre_upgrade_safety',
            checkpoint: 'none',
            progress: 0,
            lastSafeSequence: null,
            errorCode: null,
          },
          now,
        })
      } catch (error) {
        if (!isConstraintError(error)) throw error
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      try {
        await this.journal.drain()
      } catch (error) {
        try {
          await this.repository.failUpgrade({
            operationId,
            ownerToken,
            errorCode: 'INTERNAL_SERVER_ERROR',
            now: this.clock(),
          })
        } catch {}
        throw error
      }
      this.upgradeLease = lease
      retainLease = true
      this.startUpgradeExecution({
        operationId,
        ownerToken,
        artifactId: this.ids.artifactId(),
        lease,
      })
      return toPublicInstallation(record)
    } finally {
      if (!retainLease) await lease.release()
    }
  }

  async getActiveOperation(): Promise<LifecycleOperationStatus | null> {
    const existing = await this.repository.find()
    return existing?.activeOperation ?? null
  }

  async stop(): Promise<void> {
    const task = this.upgradeTask
    if (task !== undefined) await task
    const lease = this.upgradeLease
    this.upgradeLease = undefined
    if (lease !== undefined) await lease.release()
  }

  async resumeOnStartup(): Promise<InstallationStatusOutput | undefined> {
    const lease = await this.lock.acquire('upgrade')
    if (lease === undefined) return undefined
    let retainLease = false
    try {
      const existing = await this.repository.find()
      if (existing === undefined) return undefined
      assertInstallationCoherent(existing)
      if (
        existing.activeOperation === null ||
        isTerminal(existing.activeOperation) ||
        isSiteLifecycleOperation(existing.activeOperation.kind)
      ) {
        return toPublicInstallation(existing)
      }
      const now = this.clock()
      const ownerToken = generateId('own')
      const claimed = await this.repository.claimUpgrade({
        operationId: existing.activeOperation.operationId,
        expectedUpdatedAt: new Date(existing.updatedAt),
        ownerToken,
        now,
      })
      if (claimed === undefined) return toPublicInstallation(existing)
      retainLease = true
      this.upgradeLease = lease
      this.startUpgradeExecution({
        operationId: existing.activeOperation.operationId,
        ownerToken,
        artifactId: this.ids.artifactId(),
        lease,
      })
      return toPublicInstallation(claimed)
    } finally {
      if (!retainLease) await lease.release()
    }
  }

  async snapshotForHealth(): Promise<InstallationHealthSnapshot | undefined> {
    const existing = await this.repository.find()
    if (existing === undefined) return undefined
    assertInstallationCoherent(existing)
    const base: InstallationHealthSnapshot = {
      installationStatus: existing.status,
      cleanupPending: existing.cleanupPending,
    }
    if (existing.activeOperation?.kind !== 'upgrade') return base
    const readiness = await this.repository.findUpgradeReadiness(
      existing.activeOperation.operationId,
    )
    if (readiness === undefined) return base
    return {
      ...base,
      controlStore: readiness.controlStore,
      analyticsStore: readiness.analyticsStore,
    }
  }

  private async reuseExisting(
    record: InstallationRepository.Record,
    retention: InstallationRepository.Retention,
    dataDirectoryReady: boolean,
  ): Promise<InstallationInitializeOutput> {
    assertInstallationCoherent(record)
    if (record.activeOperation !== null && !isTerminal(record.activeOperation)) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    if (!dataDirectoryReady) throw new ORPCError('CONFLICT', { status: 409 })
    if (record.status === 'ready' && isSameRetention(record.defaultRetention, retention)) {
      return { status: 200, body: toPublicInstallation(record) }
    }
    if (record.status === 'uninitialized') {
      const updated = await this.repository.activate({
        retentionPolicyId: this.ids.retentionPolicyId(),
        retention,
        dataDirectoryReady: this.dataDirectoryReady(),
        updatedAt: this.clock(),
      })
      if (updated !== undefined) return { status: 201, body: toPublicInstallation(updated) }
      const reread = await this.repository.find()
      if (
        reread !== undefined &&
        reread.status === 'ready' &&
        isSameRetention(reread.defaultRetention, retention)
      ) {
        return { status: 200, body: toPublicInstallation(reread) }
      }
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    throw new ORPCError('CONFLICT', { status: 409 })
  }

  private startUpgradeExecution(input: {
    operationId: string
    ownerToken: string
    artifactId: string
    lease: LifecycleLease
  }): void {
    let task: Promise<void>
    task = this.executeUpgrade(input)
      .catch(() => undefined)
      .finally(async () => {
        if (this.upgradeTask === task) this.upgradeTask = undefined
        if (this.upgradeLease === input.lease) this.upgradeLease = undefined
        await input.lease.release()
      })
    this.upgradeTask = task
    void task.catch(() => undefined)
  }

  private async executeUpgrade(input: {
    operationId: string
    ownerToken: string
    artifactId: string
  }): Promise<void> {
    let artifact: InstallationRepository.SafetyArtifactInput | undefined
    let ownershipLost = false
    try {
      artifact = await this.repository.findSafetyArtifact(input.operationId)
      if (artifact === undefined) {
        artifact = await this.upgradeExecutor.createSafetyArtifact({
          operationId: input.operationId,
          artifactId: input.artifactId,
        })
        const recorded = await this.repository.recordSafetyArtifact({
          operationId: input.operationId,
          ownerToken: input.ownerToken,
          artifact,
          now: this.clock(),
        })
        if (recorded === undefined) {
          ownershipLost = true
          throw new Error('Upgrade execution ownership was lost')
        }
      }
      const migrationStarted = await this.repository.updateUpgradeProgress({
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        checkpoint: 'sqlite_captured',
        progress: 0.5,
        backupPhase: 'rebuilding_duckdb',
        now: this.clock(),
      })
      if (migrationStarted === undefined) {
        ownershipLost = true
        throw new Error('Upgrade execution ownership was lost')
      }
      await this.upgradeExecutor.migrate({ operationId: input.operationId })
      await this.upgradeExecutor.rebuildAnalytics({ operationId: input.operationId })
      const rebuilt = await this.repository.updateUpgradeProgress({
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        checkpoint: 'duckdb_rebuilt',
        progress: 0.9,
        backupPhase: 'rebuilding_duckdb',
        now: this.clock(),
      })
      if (rebuilt === undefined) {
        ownershipLost = true
        throw new Error('Upgrade execution ownership was lost')
      }
      if (!this.dataDirectoryReady()) throw new Error('Configured data directory is not ready')
      const completed = await this.repository.completeUpgrade({
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        now: this.clock(),
      })
      if (completed === undefined) {
        try {
          const current = await this.repository.find()
          if (
            current?.activeOperation?.operationId === input.operationId &&
            current.dataDirectoryReady === false
          ) {
            await this.repository.failUpgrade({
              operationId: input.operationId,
              ownerToken: input.ownerToken,
              errorCode: 'INTERNAL_SERVER_ERROR',
              now: this.clock(),
            })
          }
        } catch {}
        ownershipLost = true
      }
    } catch (error) {
      if (artifact !== undefined && !ownershipLost) {
        try {
          await this.upgradeExecutor.rollback({
            operationId: input.operationId,
            artifact,
          })
        } catch {}
      }
      const failCode =
        error instanceof UpgradeIncompatibilityError
          ? 'INCOMPATIBLE_BACKUP'
          : error instanceof InsufficientStorageError
            ? 'INSUFFICIENT_STORAGE'
            : error instanceof SafetyArtifactUnavailableError
              ? 'INTERNAL_SERVER_ERROR'
              : error instanceof SafetyArtifactChecksumMismatchError
                ? 'INTERNAL_SERVER_ERROR'
                : 'INTERNAL_SERVER_ERROR'
      await this.repository.failUpgrade({
        operationId: input.operationId,
        ownerToken: input.ownerToken,
        errorCode: failCode,
        now: this.clock(),
      })
    }
  }
}

function isSameRetention(
  current: InstallationRepository.Retention,
  next: InstallationRepository.Retention,
): boolean {
  return (
    current.eventMonths === next.eventMonths &&
    current.profileMonths === next.profileMonths &&
    current.replayMonths === next.replayMonths
  )
}

function toPublicInstallation(
  record: InstallationRepository.Record,
): InstallationRepository.Installation {
  return {
    status: record.status,
    defaultRetention: record.defaultRetention,
    dataDirectoryReady: record.dataDirectoryReady,
    activeOperation: record.activeOperation,
    cleanupPending: record.cleanupPending,
    derivedCleanup: record.derivedCleanup,
    backupCleanup: record.backupCleanup,
    updatedAt: record.updatedAt,
  }
}

function isConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /constraint|unique|reserved|lifecycle operation is active/i.test(error.message)
}

function isSiteLifecycleOperation(kind: InstallationRepository.ActiveOperation['kind']): boolean {
  return kind === 'site_deletion' || kind === 'site_recovery' || kind === 'site_purge'
}
