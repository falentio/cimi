export type PortResult<T> = T | PromiseLike<T>

export interface RetentionPolicy {
  readonly eventMonths: number
  readonly profileMonths: number
  readonly replayMonths: number | null
}

export interface RetentionResolver {
  effective(siteId: string): PortResult<RetentionPolicy>
}

export type LifecycleOperationKind =
  | 'backup'
  | 'restore'
  | 'upgrade'
  | 'retention'
  | 'site_deletion'
  | 'site_recovery'
  | 'purge'
  | 'site_purge'
  | 'cleanup'

export type PersistedLifecycleOperationKind = Exclude<LifecycleOperationKind, 'purge'>

export type LifecycleErrorCode =
  | 'BACKUP_FAILED'
  | 'RESTORE_FAILED'
  | 'UPGRADE_FAILED'
  | 'RETENTION_FAILED'
  | 'CLEANUP_FAILED'
  | 'INCOMPATIBLE_BACKUP'
  | 'INSUFFICIENT_STORAGE'
  | 'CONFLICT'
  | 'INTERNAL_SERVER_ERROR'

export type LifecycleLockKind = PersistedLifecycleOperationKind | 'initialization'

export const LIFECYCLE_OPERATION_PHASES = [
  'pre_upgrade_safety',
  'site_transition',
  'lifecycle_transition',
] as const
export type LifecycleOperationPhase = (typeof LIFECYCLE_OPERATION_PHASES)[number]

export const LIFECYCLE_OPERATION_CHECKPOINTS = [
  'none',
  'sqlite_captured',
  'duckdb_rebuilt',
  'structurally_ready',
] as const
export type LifecycleOperationCheckpoint = (typeof LIFECYCLE_OPERATION_CHECKPOINTS)[number]

export interface LifecycleOperationStatus {
  readonly operationId: string
  readonly kind: PersistedLifecycleOperationKind
  readonly phase: LifecycleOperationPhase
  readonly checkpoint: LifecycleOperationCheckpoint
  readonly progress: number | null
  readonly lastSafeSequence: number | null
  readonly errorCode: LifecycleErrorCode | null
}

/** Normalize the issue-facing purge alias to the contract and DB name. */
export function normalizeLifecycleOperationKind(
  kind: LifecycleOperationKind,
): PersistedLifecycleOperationKind {
  return kind === 'purge' ? 'site_purge' : kind
}

export interface LifecycleLease {
  readonly kind: LifecycleLockKind
  release(): PortResult<void>
}

export interface LifecycleLock {
  acquire(kind: LifecycleOperationKind | 'initialization'): PortResult<LifecycleLease | undefined>
  isLocked(): PortResult<boolean>
}

export interface LifecycleOperationStatusReader {
  getActiveOperation(): PortResult<LifecycleOperationStatus | null>
}

export type CollectionPolicy = Readonly<Record<string, unknown>>

export interface CollectionPolicyResolver {
  effective(siteId: string): PortResult<CollectionPolicy>
}

export interface AcceptanceJournalPort {
  drain(): PortResult<void>
}

export interface AcceptanceQuiescencePort {
  stopAdmission(): PortResult<void>
  drain(): PortResult<{ readonly lastSafeSequence: number }>
  resumeAdmission(): PortResult<void>
}

export interface ReadQuiescencePort {
  stopReads(): PortResult<void>
  drain(): PortResult<void>
  resumeReads(): PortResult<void>
}

export type LifecycleAdmissionMode =
  | 'normal'
  | 'backup-write-quiesced'
  | 'restore-read-write-quiesced'

export type StoreHealth = 'ready' | 'degraded' | 'rebuilding' | 'unavailable'

export interface AnalyticsHealth {
  readonly controlStore: StoreHealth
  readonly analyticsStore: StoreHealth
}

export interface AnalyticsReadinessPort {
  getHealth(): PortResult<AnalyticsHealth>
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  eventMonths: 12,
  profileMonths: 12,
  replayMonths: null,
}

export class InMemoryRetentionResolver implements RetentionResolver {
  readonly #overrides = new Map<string, RetentionPolicy>()
  #defaultPolicy: RetentionPolicy

  constructor(defaultPolicy: RetentionPolicy = DEFAULT_RETENTION_POLICY) {
    this.#defaultPolicy = defaultPolicy
  }

  setDefault(policy: RetentionPolicy): void {
    this.#defaultPolicy = policy
  }

  set(siteId: string, policy: RetentionPolicy): void {
    this.#overrides.set(siteId, policy)
  }

  effective(siteId: string): RetentionPolicy {
    return this.#overrides.get(siteId) ?? this.#defaultPolicy
  }
}

export class InMemoryLifecycleLock implements LifecycleLock {
  #lease: { readonly token: symbol; readonly kind: LifecycleLockKind } | undefined

  acquire(kind: LifecycleOperationKind | 'initialization'): LifecycleLease | undefined {
    if (this.#lease !== undefined) return undefined
    const lease = {
      token: Symbol('lifecycle-lease'),
      kind: kind === 'initialization' ? kind : normalizeLifecycleOperationKind(kind),
    }
    this.#lease = lease
    return {
      kind: lease.kind,
      release: () => {
        if (this.#lease?.token === lease.token) this.#lease = undefined
      },
    }
  }

  isLocked(): boolean {
    return this.#lease !== undefined
  }

  get kind(): LifecycleLockKind | undefined {
    return this.#lease?.kind
  }
}

export class InMemoryLifecycleOperationStatusReader implements LifecycleOperationStatusReader {
  #activeOperation: LifecycleOperationStatus | null = null

  setActiveOperation(operation: LifecycleOperationStatus | null): void {
    this.#activeOperation = operation
  }

  getActiveOperation(): LifecycleOperationStatus | null {
    return this.#activeOperation
  }
}

export class InMemoryCollectionPolicyResolver implements CollectionPolicyResolver {
  readonly #policies = new Map<string, CollectionPolicy>()
  #defaultPolicy: CollectionPolicy

  constructor(defaultPolicy: CollectionPolicy = {}) {
    this.#defaultPolicy = defaultPolicy
  }

  setDefault(policy: CollectionPolicy): void {
    this.#defaultPolicy = policy
  }

  set(siteId: string, policy: CollectionPolicy): void {
    this.#policies.set(siteId, policy)
  }

  effective(siteId: string): CollectionPolicy {
    return this.#policies.get(siteId) ?? this.#defaultPolicy
  }
}

export class InMemoryAcceptanceJournalPort implements AcceptanceJournalPort {
  #drainCalls = 0

  constructor(private readonly drainImplementation: () => PortResult<void> = () => undefined) {}

  drain(): PortResult<void> {
    this.#drainCalls += 1
    return this.drainImplementation()
  }

  get drainCalls(): number {
    return this.#drainCalls
  }
}

export class InMemoryAcceptanceQuiescencePort implements AcceptanceQuiescencePort {
  #admissionStopped = false
  #stopCalls = 0
  #drainCalls = 0
  #resumeCalls = 0

  constructor(
    private readonly drainImplementation: () => PortResult<{
      readonly lastSafeSequence: number
    }> = () => ({ lastSafeSequence: 0 }),
  ) {}

  stopAdmission(): void {
    this.#stopCalls += 1
    this.#admissionStopped = true
  }

  drain(): PortResult<{ readonly lastSafeSequence: number }> {
    this.#drainCalls += 1
    if (!this.#admissionStopped) throw new Error('Acceptance admission is not stopped')
    return this.drainImplementation()
  }

  resumeAdmission(): void {
    this.#resumeCalls += 1
    this.#admissionStopped = false
  }

  get admissionStopped(): boolean {
    return this.#admissionStopped
  }

  get stopCalls(): number {
    return this.#stopCalls
  }

  get drainCalls(): number {
    return this.#drainCalls
  }

  get resumeCalls(): number {
    return this.#resumeCalls
  }
}

export class InMemoryReadQuiescencePort implements ReadQuiescencePort {
  #readsStopped = false
  #stopCalls = 0
  #drainCalls = 0
  #resumeCalls = 0

  constructor(private readonly drainImplementation: () => PortResult<void> = () => undefined) {}

  stopReads(): void {
    this.#stopCalls += 1
    this.#readsStopped = true
  }

  drain(): PortResult<void> {
    this.#drainCalls += 1
    if (!this.#readsStopped) throw new Error('Read admission is not stopped')
    return this.drainImplementation()
  }

  resumeReads(): void {
    this.#resumeCalls += 1
    this.#readsStopped = false
  }

  get readsStopped(): boolean {
    return this.#readsStopped
  }

  get stopCalls(): number {
    return this.#stopCalls
  }

  get drainCalls(): number {
    return this.#drainCalls
  }

  get resumeCalls(): number {
    return this.#resumeCalls
  }
}

export class InMemoryAnalyticsReadinessPort implements AnalyticsReadinessPort {
  #health: AnalyticsHealth

  constructor(health: AnalyticsHealth = { controlStore: 'ready', analyticsStore: 'ready' }) {
    this.#health = health
  }

  setHealth(health: AnalyticsHealth): void {
    this.#health = health
  }

  getHealth(): AnalyticsHealth {
    return this.#health
  }
}
