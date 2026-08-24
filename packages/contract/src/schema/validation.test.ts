import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SCollectionPolicyUpdateFields } from '../contract/collection-policy/schema.ts'
import { SEventReportFilter, SEventTimeseries } from '../contract/event-report/schema.ts'
import { SBatchEventResult } from '../contract/event-ingestion/schema.ts'
import { SDeletionStatusOutput } from '../contract/identity-profile/query/get-deletion-status.ts'
import { SProfile } from '../contract/identity-profile/schema.ts'
import { SPublicDashboardQueryOutput } from '../contract/public-dashboard/query/query.ts'
import {
  SPublicDashboardQueryFields,
  SPublicDashboardTimeBucket,
} from '../contract/public-dashboard/schema.ts'
import { SRetentionPolicy } from '../contract/retention-policy/schema.ts'
import { SBackup } from '../contract/backup-restore/schema.ts'
import { SSiteDeleteOutput } from '../contract/site/command/delete.ts'
import { SSiteRecoverOutput } from '../contract/site/command/recover.ts'
import { SSiteDeletionStatusOutput } from '../contract/site/query/get-deletion-status.ts'
import { SHostname } from '../contract/site/schema.ts'
import { STrafficOverview } from '../contract/traffic-report/schema.ts'
import {
  MAX_MINUTE_REPORT_BUCKETS,
  MAX_PUBLIC_DASHBOARD_BUCKETS,
  EAuthenticatedRead,
  EAnalyticsExecution,
  EConfigurationRead,
  EQuery,
  SAuthenticatedFilter,
  SAuthenticatedFilterOperator,
  SDateTime,
  SPageItems,
  SRate,
  SReportFreshness,
  SReportInput,
  SScopedQueryFilter,
  SGranularReportInput,
} from './index.ts'

describe('shared report schemas', () => {
  it('keeps shared error catalogs narrow and distinct', () => {
    expect(EAuthenticatedRead).toEqual({
      UNAUTHORIZED: { status: 401 },
      NOT_FOUND: { status: 404 },
    })
    expect(EConfigurationRead).not.toHaveProperty('SERVICE_UNAVAILABLE')
    expect(EConfigurationRead).not.toHaveProperty('QUERY_LIMIT_EXCEEDED')
    expect(EAnalyticsExecution.SERVICE_UNAVAILABLE).toEqual({ status: 503 })
    expect(EAnalyticsExecution.QUERY_LIMIT_EXCEEDED).toEqual({ status: 422 })
  })

  it('declares analytics-store unavailability only for execution catalogs', () => {
    expect(EQuery.SERVICE_UNAVAILABLE).toEqual({ status: 503 })
  })

  it('requires absolute date-times and supports authenticated action filters', () => {
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00Z').success).toBe(true)
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00+02:00').success).toBe(true)
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00').success).toBe(false)
    expect(v.safeParse(SDateTime, '2026-08-01T00:00:00.000').success).toBe(false)
    expect(v.safeParse(SAuthenticatedFilterOperator, 'has_done').success).toBe(true)
    expect(v.safeParse(SAuthenticatedFilterOperator, 'has_not_done').success).toBe(true)
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
        operator: 'has_done',
        action: { kind: 'page_view', name: 'home' },
      }).success,
    ).toBe(false)
  })

  it('allows only current or stale successful report freshness', () => {
    expect(
      v.safeParse(SReportFreshness, {
        projectedAcceptanceSequence: 10,
        occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
        status: 'current',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SReportFreshness, {
        projectedAcceptanceSequence: 10,
        occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
        status: 'stale',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SReportFreshness, {
        projectedAcceptanceSequence: 10,
        occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
        status: 'gap',
      }).success,
    ).toBe(false)
  })

  it('enforces retention horizon ordering', () => {
    expect(
      v.safeParse(SRetentionPolicy, { eventMonths: 12, profileMonths: 12, replayMonths: null })
        .success,
    ).toBe(true)
    expect(
      v.safeParse(SRetentionPolicy, { eventMonths: 12, profileMonths: 6, replayMonths: 3 }).success,
    ).toBe(true)
    expect(
      v.safeParse(SRetentionPolicy, { eventMonths: 6, profileMonths: 12, replayMonths: null })
        .success,
    ).toBe(false)
    expect(
      v.safeParse(SRetentionPolicy, { eventMonths: 12, profileMonths: 6, replayMonths: 6 }).success,
    ).toBe(false)
  })

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
    expect(
      v.safeParse(SGranularReportInput, {
        fromDate: '2026-08-01',
        toDate: '2026-08-02',
        granularity: 'minute',
      }).success,
    ).toBe(false)
  })

  it('bounds minute report output to the shared one-day response ceiling', () => {
    const freshness = {
      projectedAcceptanceSequence: 10,
      occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
      status: 'current' as const,
    }
    const metricBuckets = Array.from({ length: MAX_MINUTE_REPORT_BUCKETS }, (_, index) => ({
      at: new Date(Date.parse('2026-08-01T00:00:00Z') + index * 60_000).toISOString(),
      value: 0,
      complete: true,
      metric: 'bounce_rate',
      grain: 'session',
      unit: 'rate',
      denominator: 0,
    }))
    const eventBuckets = metricBuckets.map(({ at, complete }) => ({ at, count: 0, complete }))

    expect(
      v.safeParse(STrafficOverview, {
        fromDate: '2026-08-01',
        toDate: '2026-08-01',
        visitors: 0,
        sessions: 0,
        eligibleSessions: 0,
        sessionsWithValidDuration: 0,
        pageviews: 0,
        bounceRate: 0,
        pagesPerSession: 0,
        averageSessionDurationSeconds: 0,
        trend: metricBuckets,
        ...freshness,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventTimeseries, {
        fromDate: '2026-08-01',
        toDate: '2026-08-01',
        buckets: eventBuckets,
        ...freshness,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SEventTimeseries, {
        fromDate: '2026-08-01',
        toDate: '2026-08-01',
        buckets: [...eventBuckets, { at: '2026-08-02T06:00:00Z', count: 0, complete: true }],
        ...freshness,
      }).success,
    ).toBe(false)
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
        metric: 'events',
        dimension: 'region',
        filters: [
          { scope: 'session', field: 'utmSource', operator: 'equals', values: ['newsletter'] },
        ],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SPublicDashboardQueryFields, {
        ...query,
        dimension: 'identity_kind',
        filters: [
          { scope: 'visitor', field: 'identityKind', operator: 'equals', values: ['identified'] },
        ],
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SPublicDashboardQueryFields, {
        ...query,
        filters: [
          {
            scope: 'visitor',
            field: 'identityKind',
            operator: 'not_equals',
            values: ['identified'],
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SPublicDashboardQueryFields, {
        ...query,
        filters: [
          { scope: 'visitor', field: 'identityKind', operator: 'equals', values: ['profile'] },
        ],
      }).success,
    ).toBe(false)
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

  it('bounds public hourly output at the DST-aware ceiling', () => {
    const buckets = Array.from({ length: MAX_PUBLIC_DASHBOARD_BUCKETS }, (_, index) => {
      const at = new Date(
        Date.parse('2026-11-01T00:00:00Z') + index * 60 * 60 * 1_000,
      ).toISOString()
      return { key: at, at, value: 0 }
    })
    const output = {
      fromDate: '2026-11-01',
      toDate: '2027-01-29',
      buckets,
      projectedAcceptanceSequence: 10,
      occurrenceTimeCoverageThrough: '2026-11-01T00:00:00Z',
      status: 'current' as const,
    }

    expect(v.safeParse(SPublicDashboardQueryOutput, output).success).toBe(true)
    expect(
      v.safeParse(SPublicDashboardTimeBucket, {
        key: '2026-11-01T00:00:00',
        at: null,
        value: 0,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SPublicDashboardQueryOutput, {
        ...output,
        buckets: [...buckets, { key: 'overflow', at: null, value: 0 }],
      }).success,
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

  it('requires discriminated collection policy scopes', () => {
    const policy = {
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
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'site',
        policy: { siteId: 'site-2', ...policy },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'site',
        policy,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, { scope: 'installation', policy }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'installation',
        policy: { siteId: 'site-1', ...policy },
      }).success,
    ).toBe(false)
    expect(v.safeParse(SCollectionPolicyUpdateFields, { siteId: 'site-2', policy }).success).toBe(
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
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'kind',
        operator: 'equals',
        values: ['not-an-event-kind'],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SEventReportFilter, {
        scope: 'event',
        field: 'name',
        operator: 'equals',
        values: [42],
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SScopedQueryFilter, {
        scope: 'visitor',
        field: 'identityKind',
        operator: 'equals',
        values: ['profile'],
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
    expect(v.safeParse(SProfile, { status: 'deleting' }).success).toBe(true)
    expect(
      v.safeParse(SProfile, { ...profile, status: 'deleting', traits: null, aliases: [] }).success,
    ).toBe(false)
    expect(
      v.safeParse(SProfile, {
        ...profile,
        status: 'deleting',
        traits: { plan: 'pro' },
        aliases: ['alias-1'],
      }).success,
    ).toBe(false)
  })

  it('exposes independent derived and backup cleanup status', () => {
    const status = {
      status: 'deleted',
      updatedAt: '2026-08-01T00:00:00Z',
      derivedCleanup: {
        status: 'complete',
        updatedAt: '2026-08-01T00:01:00Z',
      },
      backupCleanup: {
        status: 'pending',
        updatedAt: '2026-08-01T00:01:00Z',
      },
    }
    expect(v.safeParse(SDeletionStatusOutput, status).success).toBe(true)
    expect(
      v.safeParse(SDeletionStatusOutput, {
        ...status,
        backupCleanup: { status: 'unknown', updatedAt: status.updatedAt },
      }).success,
    ).toBe(false)
  })
})

describe('site deletion schemas', () => {
  it('accepts recoverable and purged lifecycle status', () => {
    const status = {
      siteId: 'site-1',
      status: 'deleted',
      operationId: 'operation-1',
      requestedAt: '2026-08-24T00:00:00Z',
      deletedAt: '2026-08-24T00:01:00Z',
      recoveryDeadline: '2026-09-23T00:01:00Z',
      purgeAt: '2026-09-23T00:01:00Z',
      cleanup: {
        status: 'pending',
        updatedAt: '2026-08-24T00:01:00Z',
        error: null,
      },
    }

    expect(v.safeParse(SSiteDeletionStatusOutput, status).success).toBe(true)
    expect(
      v.safeParse(SSiteDeletionStatusOutput, { ...status, status: 'recovering' }).success,
    ).toBe(true)
    expect(v.safeParse(SSiteDeletionStatusOutput, { ...status, status: 'unknown' }).success).toBe(
      false,
    )
    expect(
      v.safeParse(SSiteDeleteOutput, { accepted: true, status: 'deleting', operationId: 'op-1' })
        .success,
    ).toBe(true)
    expect(
      v.safeParse(SSiteRecoverOutput, {
        accepted: true,
        status: 'recovering',
        operationId: 'op-2',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SSiteDeletionStatusOutput, {
        ...status,
        status: 'active',
        operationId: null,
        requestedAt: null,
        deletedAt: null,
        recoveryDeadline: null,
        purgeAt: null,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SSiteDeletionStatusOutput, {
        ...status,
        status: 'active',
      }).success,
    ).toBe(false)
    expect(v.safeParse(SSiteDeletionStatusOutput, { ...status, status: 'purged' }).success).toBe(
      true,
    )
    expect(v.safeParse(SHostname, 'example.test.').success).toBe(true)
  })
})

describe('backup lifecycle schemas', () => {
  const base = {
    id: 'backup-1',
    createdAt: '2026-08-24T00:00:00Z',
    scope: 'installation' as const,
    progress: 0,
    checkpoint: 'none' as const,
    lastSafeSequence: null,
    readiness: {
      controlStore: 'not_ready' as const,
      analyticsStore: 'not_ready' as const,
      structural: 'not_ready' as const,
    },
    derivedCleanup: {
      status: 'not_applicable' as const,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    backupCleanup: {
      status: 'not_applicable' as const,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    restoreSourceBackupId: null,
    preRestoreSafetyArtifact: null,
    errorCode: null,
  }

  it('keeps backup status and phase combinations coherent', () => {
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'creating',
        completedAt: null,
        phase: 'capturing_sqlite',
        cleanupPending: false,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'available',
        completedAt: '2026-08-24T00:01:00Z',
        phase: 'ready',
        progress: 1,
        checkpoint: 'structurally_ready',
        readiness: {
          controlStore: 'ready',
          analyticsStore: 'ready',
          structural: 'ready',
        },
        cleanupPending: false,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'restoring',
        completedAt: null,
        phase: 'rebuilding_duckdb',
        progress: 0.5,
        checkpoint: 'sqlite_restored',
        lastSafeSequence: 42,
        readiness: {
          controlStore: 'ready',
          analyticsStore: 'rebuilding',
          structural: 'not_ready',
        },
        restoreSourceBackupId: 'backup-2',
        preRestoreSafetyArtifact: {
          id: 'safety-1',
          createdAt: '2026-08-24T00:00:30Z',
          status: 'ready',
          lastSafeSequence: 41,
          errorCode: null,
        },
        cleanupPending: false,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'available',
        completedAt: '2026-08-24T00:01:00Z',
        phase: 'cleanup_pending',
        progress: 1,
        checkpoint: 'structurally_ready',
        readiness: {
          controlStore: 'ready',
          analyticsStore: 'ready',
          structural: 'ready',
        },
        cleanupPending: true,
        derivedCleanup: {
          status: 'completed',
          startedAt: '2026-08-24T00:00:30Z',
          completedAt: '2026-08-24T00:00:45Z',
          errorCode: null,
        },
        backupCleanup: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorCode: null,
        },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'failed',
        completedAt: '2026-08-24T00:01:00Z',
        phase: 'failed',
        progress: 0.25,
        cleanupPending: false,
        errorCode: 'INTERNAL_SERVER_ERROR',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBackup, {
        ...base,
        status: 'available',
        completedAt: '2026-08-24T00:01:00Z',
        phase: 'capturing_sqlite',
        cleanupPending: false,
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SBackup, {
        id: 'backup-1',
        status: 'creating',
        createdAt: '2026-08-24T00:00:00Z',
        completedAt: null,
        scope: 'installation',
        phase: 'capturing_sqlite',
        cleanupPending: false,
        errorCode: null,
      }).success,
    ).toBe(false)
  })
})

describe('batch ingestion results', () => {
  it('keeps policy refusals generic and item errors bounded', () => {
    expect(
      v.safeParse(SBatchEventResult, {
        status: 'rejected',
        eventId: 'event-1',
        reason: 'policy',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBatchEventResult, {
        status: 'rejected',
        eventId: 'event-1',
        reason: 'bot',
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SBatchEventResult, {
        status: 'itemError',
        eventId: 'event-1',
        code: 'CONFLICT',
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SBatchEventResult, {
        status: 'itemError',
        eventId: null,
        code: 'FORBIDDEN',
      }).success,
    ).toBe(false)
  })
})
