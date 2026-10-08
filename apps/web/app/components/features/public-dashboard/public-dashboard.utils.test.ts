import { describe, expect, it } from 'vitest'
import type { PublicDashboardConfig } from './public-dashboard.types'
import {
  PUBLIC_DASHBOARD_LIFECYCLE_FACTS,
  PUBLIC_DASHBOARD_OPERATION_COPY,
  PUBLIC_DASHBOARD_SCOPE_FACTS,
  normalizePublicDashboardError,
  publicDashboardConfig,
  publicDashboardOperations,
  publicDashboardPath,
  publicDashboardStatus,
  publicDashboardStatusLabel,
  publicDashboardUrl,
} from './public-dashboard.utils'

const enabled: PublicDashboardConfig = {
  siteId: 'ste_1',
  enabled: true,
  publicDashboardIdentifier: 'identifier-one',
  updatedAt: '2026-10-08T10:00:00Z',
}

describe('public-dashboard.utils', () => {
  it('derives the status from the configuration', () => {
    expect(publicDashboardStatus({ kind: 'unconfigured' })).toBe('unconfigured')
    expect(
      publicDashboardStatus({ kind: 'configured', config: { ...enabled, enabled: false } }),
    ).toBe('disabled')
    expect(
      publicDashboardStatus({
        kind: 'configured',
        config: { ...enabled, publicDashboardIdentifier: null },
      }),
    ).toBe('disabled')
    expect(publicDashboardStatus({ kind: 'configured', config: enabled })).toBe('enabled')
    expect(publicDashboardStatusLabel('enabled')).toBe('Enabled')
  })

  it('exposes the raw config only for a configured Site', () => {
    expect(publicDashboardConfig({ kind: 'unconfigured' })).toBeNull()
    expect(publicDashboardConfig({ kind: 'configured', config: enabled })).toEqual(enabled)
  })

  it('offers enable only when no live identifier exists', () => {
    expect(publicDashboardOperations('unconfigured')).toEqual(['enable'])
    expect(publicDashboardOperations('disabled')).toEqual(['enable'])
    expect(publicDashboardOperations('enabled')).toEqual(['rotate', 'disable'])
  })

  it('builds the public path and URL from the identifier', () => {
    expect(publicDashboardPath('identifier-one')).toBe('/public/identifier-one')
    expect(publicDashboardUrl('https://cimi.example', 'identifier-one')).toBe(
      'https://cimi.example/public/identifier-one',
    )
  })

  it('maps an unknown Site read to a not-found refresh failure', () => {
    expect(normalizePublicDashboardError({ code: 'NOT_FOUND', status: 404 }, 'read')).toMatchObject(
      {
        kind: 'not-found',
        action: 'refresh',
      },
    )
  })

  it('never copies raw server text into a failure message', () => {
    const failure = normalizePublicDashboardError(
      { code: 'INTERNAL_SERVER_ERROR', message: '/srv/private SQL secret' },
      'operation',
    )

    expect(failure.kind).toBe('server')
    expect(JSON.stringify(failure)).not.toContain('/srv/private')
  })

  it('maps a conflict to a refresh action', () => {
    expect(normalizePublicDashboardError({ code: 'CONFLICT' }, 'operation')).toMatchObject({
      kind: 'conflict',
      action: 'refresh',
    })
  })

  it('states aggregate scope, bounds, suppression, indexing, and rate limits', () => {
    const text = PUBLIC_DASHBOARD_SCOPE_FACTS.map((fact) => `${fact.label} ${fact.detail}`).join(
      ' ',
    )

    expect(text).toContain('Aggregate only')
    expect(text).toContain('90 days')
    expect(text).toContain('one hour')
    expect(text).toContain('k=5')
    expect(text).toContain('noindex, nofollow')
    expect(text).toContain('360 requests per Site per minute')
    expect(text).toContain('600 requests per IP per minute')
  })

  it('states the lifecycle suspension and the recovery restore', () => {
    const text = PUBLIC_DASHBOARD_LIFECYCLE_FACTS.map(
      (fact) => `${fact.label} ${fact.detail}`,
    ).join(' ')

    expect(text).toContain('deleted')
    expect(text).toContain('recovering')
    expect(text).toContain('purged')
    expect(text).toContain('restores its previous public configuration')
  })

  it('frames enable and rotate as revocation without a password-reset claim', () => {
    expect(PUBLIC_DASHBOARD_OPERATION_COPY.enable.description).toContain('revokes any identifier')
    expect(PUBLIC_DASHBOARD_OPERATION_COPY.rotate.description).toContain('not a password reset')
    expect(PUBLIC_DASHBOARD_OPERATION_COPY.disable.description).toContain(
      'cannot delete a response',
    )
  })
})
