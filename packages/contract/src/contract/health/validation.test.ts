import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { contract, SSystemHealthOutput } from '../../index.ts'
import { SQueryFilter } from '../../schema/index.ts'

describe('system health contract', () => {
  it('exposes contract.health.health', () => {
    expect(contract.health.health).toBeDefined()
  })

  it('accepts a valid health output', () => {
    expect(
      v.parse(SSystemHealthOutput, {
        status: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'unavailable',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-08-23T00:00:00Z',
      }),
    ).toEqual({
      status: 'degraded',
      controlStore: 'ready',
      analyticsStore: 'unavailable',
      cleanupPending: false,
      version: '0.0.1',
      checkedAt: '2026-08-23T00:00:00Z',
    })
  })

  it('rejects a missing field', () => {
    expect(() =>
      v.parse(SSystemHealthOutput, {
        status: 'healthy',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
        version: '0.0.1',
      }),
    ).toThrow(v.ValiError)
  })

  it('rejects an invalid status', () => {
    expect(() =>
      v.parse(SSystemHealthOutput, {
        status: 'nope',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-08-23T00:00:00Z',
      }),
    ).toThrow(v.ValiError)
  })

  it('rejects healthy output when analytics is unavailable', () => {
    expect(() =>
      v.parse(SSystemHealthOutput, {
        status: 'healthy',
        controlStore: 'ready',
        analyticsStore: 'unavailable',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-08-23T00:00:00Z',
      }),
    ).toThrow(v.ValiError)
  })

  it('exposes the first-release contract domains', () => {
    expect(contract.site.createSite).toBeDefined()
    expect(contract.eventIngestion.collectEvent).toBeDefined()
    expect(contract.funnel.getFunnelReport).toBeDefined()
    expect(contract.backupRestore.restoreBackup).toBeDefined()
  })

  it('rejects unknown query filter keys', () => {
    expect(() =>
      v.parse(SQueryFilter, {
        field: 'country',
        operator: 'equals',
        values: ['GB'],
        unsafeSql: '1=1',
      }),
    ).toThrow(v.ValiError)
  })
})
