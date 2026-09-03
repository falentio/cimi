import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin } from '@cimi/guard'
import type { AcceptanceJournalPort, LifecycleLock } from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { InstallationRepository } from './repository.ts'

export type InstallationInitializeInput = InferOutput<typeof schema.SInstallationInitializeFields>
export type InstallationInitializeOutput =
  | { status: 201; body: InstallationRepository.Installation }
  | { status: 200; body: InstallationRepository.Installation }
export type InstallationUpgradeInput = { confirmation: 'UPGRADE' }
export type InstallationUpgradeOutput = InstallationRepository.Installation
export type InstallationStatusOutput = InstallationRepository.Installation

export interface UpgradeArtifactPort {
  isCompatible(): boolean | Promise<boolean>
}

export interface InstallationIdFactory {
  installationId(): string
  operationId(): string
  artifactId(): string
}

export interface InstallationServiceDependencies {
  repository: InstallationRepository
  lock: LifecycleLock
  journal: AcceptanceJournalPort
  clock?: (() => Date) | undefined
  ids?: InstallationIdFactory | undefined
  upgradeArtifact?: UpgradeArtifactPort | undefined
}

// Upgrade and resume may enter maintenance/recovering from any non-uninitialized state,
// wider than the steady-state spec diagram.
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

function assertInstallationCoherent(record: InstallationRepository.Record): void {
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
}

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'

export interface InstallationHealthSnapshot {
  installationStatus: InstallationRepository.Status
  cleanupPending: boolean
}

export class InstallationService {
  private readonly repository: InstallationRepository
  private readonly lock: LifecycleLock
  private readonly journal: AcceptanceJournalPort
  private readonly clock: () => Date
  private readonly ids: InstallationIdFactory
  private readonly upgradeArtifact: UpgradeArtifactPort

  constructor({
    repository,
    lock,
    journal,
    clock,
    ids,
    upgradeArtifact,
  }: InstallationServiceDependencies) {
    this.repository = repository
    this.lock = lock
    this.journal = journal
    this.clock = clock ?? (() => new Date())
    this.ids = ids ?? {
      installationId: () => generateId('ins'),
      operationId: () => generateId('bop'),
      artifactId: () => generateId('bar'),
    }
    this.upgradeArtifact = upgradeArtifact ?? { isCompatible: () => true }
  }

  async initialize(
    input: InstallationInitializeInput,
    user: AuthUser,
  ): Promise<InstallationInitializeOutput> {
    assertInstallationAdmin(user)
    if (!(await this.lock.acquire('retention'))) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      const existing = await this.repository.find()
      if (existing !== undefined) return this.reuseExisting(existing, input.defaultRetention)
      try {
        const now = this.clock()
        const created = await this.repository.insert({
          id: this.ids.installationId(),
          eventMonths: input.defaultRetention.eventMonths,
          profileMonths: input.defaultRetention.profileMonths,
          replayMonths: input.defaultRetention.replayMonths,
          dataDirectoryReady: true,
          createdAt: now,
          updatedAt: now,
        })
        return { status: 201, body: toPublicInstallation(created) }
      } catch (error) {
        if (!isConstraintError(error)) throw error
        const raced = await this.repository.find()
        if (raced === undefined) throw error
        return this.reuseExisting(raced, input.defaultRetention)
      }
    } finally {
      await this.lock.release()
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
    if (!(await this.lock.acquire('upgrade'))) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      const existing = await this.repository.find()
      if (existing === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      assertInstallationCoherent(existing)
      if (existing.activeOperation !== null) throw new ORPCError('CONFLICT', { status: 409 })
      if (!canTransition(existing.status, 'maintenance')) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      await this.journal.drain()
      if (!(await this.upgradeArtifact.isCompatible())) {
        throw new ORPCError('INCOMPATIBLE_BACKUP', { status: 422 })
      }
      const now = this.clock()
      const operationId = this.ids.operationId()
      let record: InstallationRepository.Record
      try {
        record = await this.repository.beginUpgrade({
          operationId,
          activeOperation: {
            phase: 'pre_upgrade_safety',
            progress: 0,
            lastSafeSequence: null,
            errorCode: null,
          },
          artifact: {
            id: this.ids.artifactId(),
            generationId: operationId,
            storageKey: `safety/${operationId}`,
            schemaVersion: '1',
            sizeBytes: 0,
            checksumAlgorithm: 'sha256',
            checksumValue: EMPTY_SHA256,
          },
          now,
        })
      } catch (error) {
        if (!isConstraintError(error)) throw error
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      return toPublicInstallation(record)
    } finally {
      await this.lock.release()
    }
  }

  async resumeOnStartup(): Promise<InstallationStatusOutput | undefined> {
    const existing = await this.repository.find()
    if (existing === undefined) return undefined
    assertInstallationCoherent(existing)
    if (existing.activeOperation === null || existing.status === 'recovering') {
      return toPublicInstallation(existing)
    }
    if (!canTransition(existing.status, 'recovering')) return toPublicInstallation(existing)
    const updated = await this.repository.update({
      status: 'recovering',
      activeOperation: existing.activeOperation,
      updatedAt: this.clock(),
    })
    return toPublicInstallation(updated ?? existing)
  }

  async snapshotForHealth(): Promise<InstallationHealthSnapshot | undefined> {
    const existing = await this.repository.find()
    if (existing === undefined) return undefined
    return { installationStatus: existing.status, cleanupPending: existing.cleanupPending }
  }

  private async reuseExisting(
    record: InstallationRepository.Record,
    retention: InstallationRepository.Retention,
  ): Promise<InstallationInitializeOutput> {
    assertInstallationCoherent(record)
    if (record.activeOperation !== null) throw new ORPCError('CONFLICT', { status: 409 })
    if (!record.dataDirectoryReady) throw new ORPCError('CONFLICT', { status: 409 })
    if (record.status !== 'uninitialized' && isSameRetention(record.defaultRetention, retention)) {
      return { status: 200, body: toPublicInstallation(record) }
    }
    if (record.status === 'uninitialized') {
      const updated = await this.repository.update({
        status: 'ready',
        activeOperation: null,
        retention,
        dataDirectoryReady: true,
        updatedAt: this.clock(),
      })
      if (updated === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      return { status: 201, body: toPublicInstallation(updated) }
    }
    throw new ORPCError('CONFLICT', { status: 409 })
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
  return /constraint|unique|reserved/i.test(error.message)
}
