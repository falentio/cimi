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

    resolver.set('site-1', sitePolicy)

    expect(resolver.effective('site-1')).toEqual(sitePolicy)
    expect(resolver.effective('site-2')).toEqual({
      eventMonths: 12,
      profileMonths: 12,
      replayMonths: null,
    })
  })

  it('serializes lifecycle operations with one global lock', () => {
    const lock = new InMemoryLifecycleLock()

    expect(lock.acquire('backup')).toBe(true)
    expect(lock.acquire('restore')).toBe(false)
    expect(lock.isLocked()).toBe(true)
    expect(lock.kind).toBe('backup')
    lock.release()
    expect(lock.isLocked()).toBe(false)
  })

  it('normalizes the issue alias purge to the persisted site_purge kind', () => {
    expect(normalizeLifecycleOperationKind('purge')).toBe('site_purge')
    expect(normalizeLifecycleOperationKind('site_purge')).toBe('site_purge')

    const lock = new InMemoryLifecycleLock()
    expect(lock.acquire('purge')).toBe(true)
    expect(lock.kind).toBe('site_purge')
  })

  it('resolves collection policy and exposes readiness state', () => {
    const policy = { anonymousCollection: 'enabled' }
    const policies = new InMemoryCollectionPolicyResolver()
    const readiness = new InMemoryAnalyticsReadinessPort()

    policies.set('site-1', policy)
    readiness.setHealth({ controlStore: 'ready', analyticsStore: 'rebuilding' })

    expect(policies.effective('site-1')).toEqual(policy)
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
