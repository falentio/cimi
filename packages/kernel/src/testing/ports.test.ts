import { describe, expect, it } from 'vitest'
import {
  InMemoryAcceptanceJournalPort,
  InMemoryAnalyticsReadinessPort,
  InMemoryCollectionPolicyResolver,
  InMemoryLifecycleLock,
  InMemoryRetentionResolver,
  normalizeLifecycleOperationKind,
} from '../index.ts'

describe('in-memory kernel ports', () => {
  it('resolves site retention overrides over the installation default', () => {
    const resolver = new InMemoryRetentionResolver()
    const sitePolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    resolver.set('ste-1', sitePolicy)

    expect(resolver.effective('ste-1')).toEqual(sitePolicy)
    expect(resolver.effective('ste-2')).toEqual({
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
    })
  })

  it('serializes lifecycle operations with one global lock', () => {
    const lock = new InMemoryLifecycleLock()

    const lease = lock.acquire('backup')
    expect(lease).toBeDefined()
    expect(lock.acquire('restore')).toBeUndefined()
    expect(lock.isLocked()).toBe(true)
    expect(lock.kind).toBe('backup')
    if (lease === undefined) throw new Error('expected a lifecycle lease')
    lease.release()
    expect(lock.isLocked()).toBe(false)
  })

  it('normalizes the issue alias purge to the persisted site_purge kind', () => {
    expect(normalizeLifecycleOperationKind('purge')).toBe('site_purge')
    expect(normalizeLifecycleOperationKind('site_purge')).toBe('site_purge')

    const lock = new InMemoryLifecycleLock()
    expect(lock.acquire('purge')).toBeDefined()
    expect(lock.kind).toBe('site_purge')
  })

  it('does not let a stale lease release a newer owner', () => {
    const lock = new InMemoryLifecycleLock()
    const first = lock.acquire('backup')
    if (first === undefined) throw new Error('expected the first lease')
    first.release()
    const second = lock.acquire('restore')
    if (second === undefined) throw new Error('expected the second lease')

    first.release()

    expect(lock.isLocked()).toBe(true)
    second.release()
  })

  it('resolves collection policy and exposes readiness state', () => {
    const policy = { anonymousCollection: 'enabled' }
    const policies = new InMemoryCollectionPolicyResolver()
    const readiness = new InMemoryAnalyticsReadinessPort()

    policies.set('ste-1', policy)
    readiness.setHealth({ controlStore: 'ready', analyticsStore: 'rebuilding' })

    expect(policies.effective('ste-1')).toEqual(policy)
    expect(readiness.getHealth()).toEqual({
      controlStore: 'ready',
      analyticsStore: 'rebuilding',
    })
  })

  it('drains the acceptance journal through its injected boundary', async () => {
    let drained = false
    const journal = new InMemoryAcceptanceJournalPort(async () => {
      drained = true
    })

    await journal.drain()

    expect(drained).toBe(true)
    expect(journal.drainCalls).toBe(1)
  })
})
