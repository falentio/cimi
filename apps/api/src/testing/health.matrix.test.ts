import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/contract'
import {
  resolveAdmissionGate,
  resolveHealthStatus,
  resolveInstallationHealth,
  type InstallationHealthInput,
} from '../health.ts'

const base = {
  installationStatus: 'ready',
  controlStore: 'ready',
  analyticsStore: 'ready',
  cleanupPending: false,
} as const satisfies InstallationHealthInput

function parseHealth(input: InstallationHealthInput) {
  return v.parse(schema.SHealth, {
    status: resolveInstallationHealth(input),
    controlStore: input.controlStore,
    analyticsStore: input.analyticsStore,
    cleanupPending: input.cleanupPending,
    version: '0.0.1',
    checkedAt: '2026-09-01T00:00:00.000Z',
  })
}

describe('resolveInstallationHealth', () => {
  it('reports healthy only when everything is ready', () => {
    expect(resolveInstallationHealth(base)).toBe('healthy')
  })

  it.each([
    { analyticsStore: 'degraded', cleanupPending: false },
    { analyticsStore: 'rebuilding', cleanupPending: false },
    { analyticsStore: 'unavailable', cleanupPending: false },
    { analyticsStore: 'ready', cleanupPending: true },
  ] as const)('reports degraded for %o with a ready control store', (override) => {
    expect(resolveInstallationHealth({ ...base, ...override })).toBe('degraded')
  })

  it.each(['recovering', 'maintenance'] as const)(
    'passes %s through with control ready',
    (status) => {
      expect(
        resolveInstallationHealth({
          installationStatus: status,
          controlStore: 'ready',
          analyticsStore: 'rebuilding',
          cleanupPending: true,
        }),
      ).toBe(status)
    },
  )

  it('maps degraded installation with healthy stores to degraded', () => {
    expect(
      resolveInstallationHealth({
        installationStatus: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: false,
      }),
    ).toBe('degraded')
  })

  it('maps degraded installation with cleanup to degraded', () => {
    expect(
      resolveInstallationHealth({
        installationStatus: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'ready',
        cleanupPending: true,
      }),
    ).toBe('degraded')
  })

  it('maps uninitialized with a bad control store to unavailable', () => {
    expect(
      resolveInstallationHealth({
        installationStatus: 'uninitialized',
        controlStore: 'degraded',
        analyticsStore: 'ready',
        cleanupPending: false,
      }),
    ).toBe('unavailable')
  })

  it.each(['degraded', 'rebuilding', 'unavailable'] as const)(
    'reports unavailable when the control store is %s',
    (controlStore) => {
      for (const installationStatus of ['ready', 'recovering', 'maintenance'] as const) {
        expect(
          resolveInstallationHealth({
            installationStatus,
            controlStore,
            analyticsStore: 'ready',
            cleanupPending: false,
          }),
        ).toBe('unavailable')
      }
    },
  )

  it('matches the positional resolveHealthStatus', () => {
    expect(resolveHealthStatus('ready', 'ready', 'ready', false)).toBe('healthy')
    expect(resolveHealthStatus('maintenance', 'ready', 'ready', true)).toBe('maintenance')
    expect(resolveHealthStatus('ready', 'ready', 'degraded', false)).toBe('degraded')
    expect(resolveHealthStatus('ready', 'unavailable', 'ready', false)).toBe('unavailable')
  })

  it('resolves only matrix-valid combinations', () => {
    const inputs: InstallationHealthInput[] = [
      base,
      { ...base, analyticsStore: 'degraded' },
      { ...base, analyticsStore: 'rebuilding' },
      { ...base, analyticsStore: 'unavailable' },
      { ...base, cleanupPending: true },
      { ...base, installationStatus: 'recovering', analyticsStore: 'rebuilding' },
      { ...base, installationStatus: 'maintenance', cleanupPending: true },
      { ...base, installationStatus: 'recovering', controlStore: 'unavailable' },
      { ...base, controlStore: 'degraded' },
      { ...base, controlStore: 'rebuilding' },
      { ...base, installationStatus: 'degraded' },
      { ...base, installationStatus: 'degraded', cleanupPending: true },
      { ...base, installationStatus: 'uninitialized' },
    ]
    for (const input of inputs) {
      expect(() => parseHealth(input)).not.toThrow()
    }
  })

  it('rejects healthy output when analytics is unready', () => {
    expect(() =>
      v.parse(schema.SHealth, {
        status: 'healthy',
        controlStore: 'ready',
        analyticsStore: 'unavailable',
        cleanupPending: false,
        version: '0.0.1',
        checkedAt: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow(v.ValiError)
  })
})

describe('resolveAdmissionGate', () => {
  it('accepts everything only when healthy', () => {
    expect(resolveAdmissionGate('healthy')).toEqual({
      ingestion: 'accept',
      analyticsReads: 'ok',
    })
  })

  it('keeps accept-only ingestion while analytics reads stay unavailable', () => {
    expect(resolveAdmissionGate('degraded')).toEqual({
      ingestion: 'accept-only',
      analyticsReads: 'unavailable',
    })
  })

  it.each(['recovering', 'maintenance', 'unavailable'] as const)(
    'pauses ingestion and analytics reads while %s',
    (status) => {
      expect(resolveAdmissionGate(status)).toEqual({
        ingestion: 'paused',
        analyticsReads: 'unavailable',
      })
    },
  )
})
