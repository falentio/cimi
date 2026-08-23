import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SCollectionPolicyUpdateFields } from '../contract/collection-policy/schema.ts'
import { SEventReportFilter } from '../contract/event-report/schema.ts'
import { SProfile } from '../contract/identity-profile/schema.ts'
import { SPublicDashboardQueryFields } from '../contract/public-dashboard/schema.ts'
import { SPageItems, SRate, SReportInput, SGranularReportInput } from './index.ts'

describe('shared report schemas', () => {
  it('rejects reversed report and comparison ranges', () => {
    expect(
      v.safeParse(SReportInput, {
        fromDate: '2026-08-23',
        toDate: '2026-08-22',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SReportInput, {
        fromDate: '2026-08-22',
        toDate: '2026-08-23',
        comparison: { fromDate: '2026-08-23', toDate: '2026-08-22' },
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SReportInput, {
        fromDate: '2026-08-22',
        toDate: '2026-08-23',
        comparison: { fromDate: '2026-08-20', toDate: '2026-08-21' },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SReportInput, {
        fromDate: '2026-08-22',
        toDate: '2026-08-23',
        comparison: { fromDate: '2026-08-19', toDate: '2026-08-20' },
      }).success,
    ).toBe(false)
  })

  it('rejects granular ranges beyond procedure limits', () => {
    expect(
      v.safeParse(SGranularReportInput, {
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        granularity: 'hour',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SGranularReportInput, {
        fromDate: '2026-08-01',
        toDate: '2026-08-01',
        granularity: 'minute',
      }).success,
    ).toBe(true)
  })

  it('enforces public date and field allowlists', () => {
    const query = {
      publicDashboardIdentifier: 'public-dashboard-1',
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      granularity: 'hour',
      metric: 'visitors',
      dimension: 'page',
      filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/'] }],
    }
    expect(v.safeParse(SPublicDashboardQueryFields, query).success).toBe(true)
    expect(
      v.safeParse(SPublicDashboardQueryFields, {
        ...query,
        filters: [{ scope: 'visitor', field: 'email', operator: 'equals', values: ['x'] }],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SPublicDashboardQueryFields, { ...query, toDate: '2026-11-01' }).success,
    ).toBe(false)
  })

  it('bounds paginated items and report rates', () => {
    expect(
      v.safeParse(
        SPageItems(v.string()),
        Array.from({ length: 100 }, () => 'item'),
      ).success,
    ).toBe(true)
    expect(
      v.safeParse(
        SPageItems(v.string()),
        Array.from({ length: 101 }, () => 'item'),
      ).success,
    ).toBe(false)
    expect(v.safeParse(SRate, 1).success).toBe(true)
    expect(v.safeParse(SRate, 1.01).success).toBe(false)
    expect(v.safeParse(SRate, Number.POSITIVE_INFINITY).success).toBe(false)
  })

  it('requires collection policy Site scope to match the request', () => {
    const policy = {
      siteId: 'site-2',
      anonymousCollection: 'enabled',
      honorGpcDnt: true,
      consentMode: 'required_for_identity',
      botPolicy: 'exclude',
      captureQueryStrings: false,
      urlPolicy: {
        capturePath: true,
        captureReferrer: true,
        stripQueryStrings: true,
        stripSensitiveValues: true,
      },
      propertyPolicy: {
        allowScalarProperties: true,
        maxProperties: 32,
        maxValueLength: 256,
        reservedNames: [],
      },
      profileFilterKeys: [],
      exclusions: { hostnames: [], paths: [], countries: [], ipRanges: [] },
    }
    expect(v.safeParse(SCollectionPolicyUpdateFields, { siteId: 'site-2', policy }).success).toBe(
      true,
    )
    expect(v.safeParse(SCollectionPolicyUpdateFields, { siteId: 'site-1', policy }).success).toBe(
      false,
    )
  })

  it('enforces the event report filter allowlist', () => {
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'property.plan',
        operator: 'equals',
        values: ['pro'],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'session',
        field: 'country',
        operator: 'equals',
        values: ['GB'],
      }).success,
    ).toBe(false)
  })

  it('redacts traits and aliases for non-active profiles', () => {
    const profile = {
      siteId: 'site-1',
      identifiedUserId: 'user-1',
      firstSeenAt: '2026-08-01T00:00:00Z',
      lastSeenAt: '2026-08-01T00:00:00Z',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    expect(
      v.safeParse(SProfile, { ...profile, status: 'deleting', traits: null, aliases: [] }).success,
    ).toBe(true)
    expect(
      v.safeParse(SProfile, {
        ...profile,
        status: 'deleting',
        traits: { plan: 'pro' },
        aliases: ['alias-1'],
      }).success,
    ).toBe(false)
  })
})
