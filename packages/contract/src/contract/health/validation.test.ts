import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { contract } from '../../index.ts'
import { SHealthOutput } from './query/health.ts'

describe('health contract', () => {
  it('uses health as the procedure name for the /system/health route', () => {
    expect(contract.health.health).toBeDefined()
    expect(contract.health.health['~orpc'].route).toMatchObject({
      operationId: 'health',
      path: '/system/health',
    })
  })

  it('accepts a valid health output', () => {
    expect(
      v.parse(SHealthOutput, {
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
      v.parse(SHealthOutput, {
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
      v.parse(SHealthOutput, {
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
      v.parse(SHealthOutput, {
        status: 'healthy',
        controlStore: 'ready',
        analyticsStore: 'unavailable',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-08-23T00:00:00Z',
      }),
    ).toThrow(v.ValiError)
  })

  it('rejects degraded output when both stores are ready without cleanup', () => {
    expect(() =>
      v.parse(SHealthOutput, {
        status: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-08-23T00:00:00Z',
      }),
    ).toThrow(v.ValiError)
  })

  it('accepts the recovering and maintenance matrix rows', () => {
    for (const status of ['recovering', 'maintenance'] as const) {
      expect(() =>
        v.parse(SHealthOutput, {
          status,
          controlStore: 'ready',
          analyticsStore: status === 'recovering' ? 'rebuilding' : 'ready',
          cleanupPending: false,
          version: '0.0.1',
          checkedAt: '2026-08-23T00:00:00Z',
        }),
      ).not.toThrow()
    }
  })

  it('exposes the first-release contract domains', () => {
    expect(contract.site.createSite).toBeDefined()
    expect(contract.eventIngestion.collectEvent).toBeDefined()
    expect(contract.funnel.getFunnelReport).toBeDefined()
    expect(contract.backupRestore.restoreBackup).toBeDefined()
  })
})
