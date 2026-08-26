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

/** Normalize the issue-facing purge alias to the contract and DB name. */
export function normalizeLifecycleOperationKind(
  kind: LifecycleOperationKind,
): PersistedLifecycleOperationKind {
  return kind === 'purge' ? 'site_purge' : kind
}

export interface LifecycleLock {
  acquire(kind: LifecycleOperationKind): PortResult<boolean>
  release(): PortResult<void>
  isLocked(): PortResult<boolean>
}

export type CollectionPolicy = Readonly<Record<string, unknown>>

export interface CollectionPolicyResolver {
  effective(siteId: string): PortResult<CollectionPolicy>
}

export interface AcceptanceJournalPort {
  drain(): PortResult<void>
}

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
  #kind: PersistedLifecycleOperationKind | undefined

  acquire(kind: LifecycleOperationKind): boolean {
    if (this.#kind !== undefined) return false
    this.#kind = normalizeLifecycleOperationKind(kind)
    return true
  }

  release(): void {
    this.#kind = undefined
  }

  isLocked(): boolean {
    return this.#kind !== undefined
  }

  get kind(): PersistedLifecycleOperationKind | undefined {
    return this.#kind
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
