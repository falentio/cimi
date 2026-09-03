import { describe, expect, it } from 'vitest'
import { AUTH_META_VALUES } from '../orpc/meta.ts'
import {
  EAuthenticatedRead,
  EAnalyticsExecution,
  EConfigurationRead,
  SAuthenticatedFilter,
  SPropertyFilter,
  SDateTime,
} from './index.ts'

describe('shared contract primitives', () => {
  it('keeps configuration and analytics execution catalogs distinct', () => {
    expect(Object.keys(EAuthenticatedRead)).toEqual(['UNAUTHORIZED', 'NOT_FOUND'])
    expect(Object.keys(EConfigurationRead)).toEqual(['UNAUTHORIZED', 'NOT_FOUND'])
    expect(Object.keys(EAnalyticsExecution)).toEqual([
      'UNAUTHORIZED',
      'NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'QUERY_LIMIT_EXCEEDED',
    ])
  })

  it('requires an explicit timezone for absolute timestamps', () => {
    expect('2026-08-01T00:00:00Z').toEqual(expect.schemaMatching(SDateTime))
    expect('2026-08-01T00:00:00-04:00').toEqual(expect.schemaMatching(SDateTime))
    expect('2026-08-01T00:00:00').not.toEqual(expect.schemaMatching(SDateTime))
  })

  it('supports authenticated same-range action filters without widening property filters', () => {
    expect({
      scope: 'visitor',
      operator: 'has_done',
      action: { kind: 'custom_event', name: 'signup' },
    }).toEqual(expect.schemaMatching(SAuthenticatedFilter))
    expect({
      scope: 'visitor',
      operator: 'has_not_done',
      action: { kind: 'page_view', name: 'home' },
    }).not.toEqual(expect.schemaMatching(SAuthenticatedFilter))
    expect({
      field: 'event',
      operator: 'has_done',
      values: ['signup'],
    }).not.toEqual(expect.schemaMatching(SPropertyFilter))
  })

  it('publishes the shared authorization vocabulary', () => {
    expect(AUTH_META_VALUES).toEqual([
      'public',
      'authenticated',
      'admin',
      'owner',
      'site-admin',
      'organization-admin',
      'installation-admin',
    ])
  })
})
