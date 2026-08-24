import * as v from 'valibot'
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
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00Z').success).toBe(true)
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00-04:00').success).toBe(true)
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00').success).toBe(false)
  })

  it('supports authenticated same-range action filters without widening property filters', () => {
    expect(
      v.safeParse(SAuthenticatedFilter, {
        scope: 'visitor',
        operator: 'has_done',
        action: { kind: 'custom_event', name: 'signup' },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SAuthenticatedFilter, {
        scope: 'visitor',
        operator: 'has_not_done',
        action: { kind: 'page_view', name: 'home' },
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SPropertyFilter, {
        field: 'event',
        operator: 'has_done',
        values: ['signup'],
      }).success,
    ).toBe(false)
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
