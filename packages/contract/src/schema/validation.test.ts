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
  EAdministratorRead,
  EAuthenticatedCommand,
  EAuthenticatedRead,
  EAnalyticsExecution,
  EConfigurationRead,
  EIngestion,
  EBatchIngestion,
  EQuery,
  ERROR_CATALOG,
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
      UNAUTHORIZED: { status: 401, message: 'Authentication is required.' },
      NOT_FOUND: { status: 404, message: 'The requested resource was not found.' },
    })
    expect(EConfigurationRead).not.toHaveProperty('SERVICE_UNAVAILABLE')
    expect(EConfigurationRead).not.toHaveProperty('QUERY_LIMIT_EXCEEDED')
    expect(EAnalyticsExecution.SERVICE_UNAVAILABLE).toEqual({
      status: 503,
      message: 'The service is temporarily unavailable.',
    })
    expect(EAnalyticsExecution['QUERY_LIMIT_EXCEEDED']).toEqual({
      status: 422,
      message: 'The requested query exceeds the available data or work budget.',
    })
  })

  it('derives every legacy error map entry from the central catalog', () => {
    const entry = (code: keyof typeof ERROR_CATALOG) => ({
      status: ERROR_CATALOG[code].status,
      message: ERROR_CATALOG[code].message,
    })

    expect(EAdministratorRead).toEqual({
      UNAUTHORIZED: entry('UNAUTHORIZED'),
      NOT_FOUND: entry('NOT_FOUND'),
      FORBIDDEN: entry('FORBIDDEN'),
    })
    expect(EAuthenticatedCommand).toEqual({
      UNAUTHORIZED: entry('UNAUTHORIZED'),
      NOT_FOUND: entry('NOT_FOUND'),
      CONFLICT: entry('CONFLICT'),
    })
    expect(EIngestion).toEqual({
      BAD_REQUEST: entry('BAD_REQUEST'),
      FORBIDDEN: entry('FORBIDDEN'),
      NOT_FOUND: entry('NOT_FOUND'),
      CONFLICT: entry('CONFLICT'),
      PAYLOAD_TOO_LARGE: entry('PAYLOAD_TOO_LARGE'),
      TOO_MANY_REQUESTS: entry('TOO_MANY_REQUESTS'),
      SERVICE_UNAVAILABLE: entry('SERVICE_UNAVAILABLE'),
    })
    expect(EBatchIngestion).toEqual({
      BAD_REQUEST: entry('BAD_REQUEST'),
      NOT_FOUND: entry('NOT_FOUND'),
      PAYLOAD_TOO_LARGE: entry('PAYLOAD_TOO_LARGE'),
      TOO_MANY_REQUESTS: entry('TOO_MANY_REQUESTS'),
      SERVICE_UNAVAILABLE: entry('SERVICE_UNAVAILABLE'),
    })
  })

  it('declares analytics-store unavailability only for execution catalogs', () => {
    expect(EQuery.SERVICE_UNAVAILABLE).toEqual({
      status: 503,
      message: 'The service is temporarily unavailable.',
    })
  })

  it('requires absolute date-times and supports authenticated action filters', () => {
    expect('2026-08-01T00:00:00Z').toEqual(expect.schemaMatching(SDateTime))
    expect('2026-08-01T00:00:00+02:00').toEqual(expect.schemaMatching(SDateTime))
    expect('2026-08-01T00:00:00').not.toEqual(expect.schemaMatching(SDateTime))
    expect('2026-08-01T00:00:00.000').not.toEqual(expect.schemaMatching(SDateTime))
    expect('has_done').toEqual(expect.schemaMatching(SAuthenticatedFilterOperator))
    expect('has_not_done').toEqual(expect.schemaMatching(SAuthenticatedFilterOperator))
    expect({
      scope: 'visitor',
      operator: 'has_done',
      action: { kind: 'custom_event', name: 'signup' },
    }).toEqual(expect.schemaMatching(SAuthenticatedFilter))
    expect({
      scope: 'visitor',
      operator: 'has_done',
      action: { kind: 'page_view', name: 'home' },
    }).not.toEqual(expect.schemaMatching(SAuthenticatedFilter))
  })

  it('allows only current or stale successful report freshness', () => {
    expect({
      projectedAcceptanceSequence: 10,
      occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
      status: 'current',
    }).toEqual(expect.schemaMatching(SReportFreshness))
    expect({
      projectedAcceptanceSequence: 10,
      occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
      status: 'stale',
    }).toEqual(expect.schemaMatching(SReportFreshness))
    expect({
      projectedAcceptanceSequence: 10,
      occurrenceTimeCoverageThrough: '2026-08-01T00:00:00Z',
      status: 'gap',
    }).not.toEqual(expect.schemaMatching(SReportFreshness))
  })

  it('enforces retention horizon ordering', () => {
    expect({ eventMonths: 12, profileMonths: 12, replayMonths: null }).toEqual(
      expect.schemaMatching(SRetentionPolicy),
    )
    expect({ eventMonths: 12, profileMonths: 6, replayMonths: 3 }).toEqual(
      expect.schemaMatching(SRetentionPolicy),
    )
    expect({ eventMonths: 6, profileMonths: 12, replayMonths: null }).not.toEqual(
      expect.schemaMatching(SRetentionPolicy),
    )
    expect({ eventMonths: 12, profileMonths: 6, replayMonths: 6 }).not.toEqual(
      expect.schemaMatching(SRetentionPolicy),
    )
  })

  it('rejects reversed report and comparison ranges', () => {
    expect({
      fromDate: '2026-08-23',
      toDate: '2026-08-22',
    }).not.toEqual(expect.schemaMatching(SReportInput))
    expect({
      fromDate: '2026-08-22',
      toDate: '2026-08-23',
      comparison: { fromDate: '2026-08-23', toDate: '2026-08-22' },
    }).not.toEqual(expect.schemaMatching(SReportInput))
    expect({
      fromDate: '2026-08-22',
      toDate: '2026-08-23',
      comparison: { fromDate: '2026-08-20', toDate: '2026-08-21' },
    }).toEqual(expect.schemaMatching(SReportInput))
    expect({
      fromDate: '2026-08-22',
      toDate: '2026-08-23',
      comparison: { fromDate: '2026-08-19', toDate: '2026-08-20' },
    }).not.toEqual(expect.schemaMatching(SReportInput))
  })

  it('rejects granular ranges beyond procedure limits', () => {
    expect({
      fromDate: '2026-08-01',
      toDate: '2026-08-31',
      granularity: 'hour',
    }).not.toEqual(expect.schemaMatching(SGranularReportInput))
    expect({
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      granularity: 'minute',
    }).toEqual(expect.schemaMatching(SGranularReportInput))
    expect({
      fromDate: '2026-08-01',
      toDate: '2026-08-02',
      granularity: 'minute',
    }).not.toEqual(expect.schemaMatching(SGranularReportInput))
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

    expect({
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
    }).toEqual(expect.schemaMatching(STrafficOverview))
    expect({
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      buckets: eventBuckets,
      ...freshness,
    }).toEqual(expect.schemaMatching(SEventTimeseries))
    expect({
      fromDate: '2026-08-01',
      toDate: '2026-08-01',
      buckets: [...eventBuckets, { at: '2026-08-02T06:00:00Z', count: 0, complete: true }],
      ...freshness,
    }).not.toEqual(expect.schemaMatching(SEventTimeseries))
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
    expect(query).toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({
      ...query,
      metric: 'events',
      dimension: 'region',
      filters: [
        { scope: 'session', field: 'utmSource', operator: 'equals', values: ['newsletter'] },
      ],
    }).toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({
      ...query,
      dimension: 'identity_kind',
      filters: [
        { scope: 'visitor', field: 'identityKind', operator: 'equals', values: ['identified'] },
      ],
    }).toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({
      ...query,
      filters: [
        {
          scope: 'visitor',
          field: 'identityKind',
          operator: 'not_equals',
          values: ['identified'],
        },
      ],
    }).not.toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({
      ...query,
      filters: [
        { scope: 'visitor', field: 'identityKind', operator: 'equals', values: ['profile'] },
      ],
    }).not.toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({
      ...query,
      filters: [{ scope: 'visitor', field: 'email', operator: 'equals', values: ['x'] }],
    }).not.toEqual(expect.schemaMatching(SPublicDashboardQueryFields))
    expect({ ...query, toDate: '2026-11-01' }).not.toEqual(
      expect.schemaMatching(SPublicDashboardQueryFields),
    )
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

    expect(output).toEqual(expect.schemaMatching(SPublicDashboardQueryOutput))
    expect({
      key: '2026-11-01T00:00:00',
      at: null,
      value: 0,
    }).not.toEqual(expect.schemaMatching(SPublicDashboardTimeBucket))
    expect({
      ...output,
      buckets: [...buckets, { key: 'overflow', at: null, value: 0 }],
    }).not.toEqual(expect.schemaMatching(SPublicDashboardQueryOutput))
  })

  it('bounds paginated items and report rates', () => {
    expect(Array.from({ length: 100 }, () => 'item')).toEqual(
      expect.schemaMatching(SPageItems(v.string())),
    )
    expect(Array.from({ length: 101 }, () => 'item')).not.toEqual(
      expect.schemaMatching(SPageItems(v.string())),
    )
    expect(1).toEqual(expect.schemaMatching(SRate))
    expect(1.01).not.toEqual(expect.schemaMatching(SRate))
    expect(Number.POSITIVE_INFINITY).not.toEqual(expect.schemaMatching(SRate))
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
    expect({
      scope: 'site',
      policy: { siteId: 'ste-2', ...policy },
    }).toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({
      scope: 'site',
      policy,
    }).not.toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({ scope: 'installation', policy }).toEqual(
      expect.schemaMatching(SCollectionPolicyUpdateFields),
    )
    expect({
      scope: 'installation',
      policy: { siteId: 'ste-1', ...policy },
    }).not.toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({ siteId: 'ste-2', policy }).not.toEqual(
      expect.schemaMatching(SCollectionPolicyUpdateFields),
    )
  })

  it('enforces the event report filter allowlist', () => {
    expect({
      scope: 'event',
      field: 'property.plan',
      operator: 'equals',
      values: ['pro'],
    }).toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'session',
      field: 'country',
      operator: 'equals',
      values: ['GB'],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'kind',
      operator: 'equals',
      values: ['not-an-event-kind'],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'event',
      field: 'name',
      operator: 'equals',
      values: [42],
    }).not.toEqual(expect.schemaMatching(SEventReportFilter))
    expect({
      scope: 'visitor',
      field: 'identityKind',
      operator: 'equals',
      values: ['profile'],
    }).not.toEqual(expect.schemaMatching(SScopedQueryFilter))
  })

  it('redacts traits and aliases for non-active profiles', () => {
    const profile = {
      siteId: 'ste-1',
      identifiedUserId: 'user-1',
      firstSeenAt: '2026-08-01T00:00:00Z',
      lastSeenAt: '2026-08-01T00:00:00Z',
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-01T00:00:00Z',
    }
    expect({ status: 'deleting' }).toEqual(expect.schemaMatching(SProfile))
    expect({ ...profile, status: 'deleting', traits: null, aliases: [] }).not.toEqual(
      expect.schemaMatching(SProfile),
    )
    expect({
      ...profile,
      status: 'deleting',
      traits: { plan: 'pro' },
      aliases: ['alias-1'],
    }).not.toEqual(expect.schemaMatching(SProfile))
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
    expect(status).toEqual(expect.schemaMatching(SDeletionStatusOutput))
    expect({
      ...status,
      backupCleanup: { status: 'unknown', updatedAt: status.updatedAt },
    }).not.toEqual(expect.schemaMatching(SDeletionStatusOutput))
  })
})

describe('site deletion schemas', () => {
  it('accepts recoverable and purged lifecycle status', () => {
    const status = {
      siteId: 'ste-1',
      status: 'deleted',
      operationId: 'sop-1',
      requestedAt: '2026-08-24T00:00:00Z',
      deletedAt: '2026-08-24T00:01:00Z',
      recoveryDeadline: '2026-09-23T00:01:00Z',
      purgeAt: '2026-09-23T00:01:00Z',
      cleanup: {
        status: 'pending',
        updatedAt: '2026-08-24T00:01:00Z',
        errorCode: null,
      },
    }

    expect(status).toEqual(expect.schemaMatching(SSiteDeletionStatusOutput))
    expect({ ...status, status: 'recovering' }).toEqual(
      expect.schemaMatching(SSiteDeletionStatusOutput),
    )
    expect({ ...status, status: 'unknown' }).not.toEqual(
      expect.schemaMatching(SSiteDeletionStatusOutput),
    )
    expect({ accepted: true, status: 'deleting', operationId: 'sop-1' }).toEqual(
      expect.schemaMatching(SSiteDeleteOutput),
    )
    expect({
      accepted: true,
      status: 'recovering',
      operationId: 'sop-2',
    }).toEqual(expect.schemaMatching(SSiteRecoverOutput))
    expect({
      ...status,
      status: 'active',
      operationId: null,
      requestedAt: null,
      deletedAt: null,
      recoveryDeadline: null,
      purgeAt: null,
    }).toEqual(expect.schemaMatching(SSiteDeletionStatusOutput))
    expect({
      ...status,
      status: 'active',
    }).not.toEqual(expect.schemaMatching(SSiteDeletionStatusOutput))
    expect({ ...status, status: 'purged' }).toEqual(
      expect.schemaMatching(SSiteDeletionStatusOutput),
    )
    expect('example.test.').toEqual(expect.schemaMatching(SHostname))
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
    expect({
      ...base,
      status: 'creating',
      completedAt: null,
      phase: 'capturing_sqlite',
      cleanupPending: false,
    }).toEqual(expect.schemaMatching(SBackup))
    expect({
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
    }).toEqual(expect.schemaMatching(SBackup))
    expect({
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
    }).toEqual(expect.schemaMatching(SBackup))
    expect({
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
    }).toEqual(expect.schemaMatching(SBackup))
    expect({
      ...base,
      status: 'failed',
      completedAt: '2026-08-24T00:01:00Z',
      phase: 'failed',
      progress: 0.25,
      cleanupPending: false,
      errorCode: 'INTERNAL_SERVER_ERROR',
    }).toEqual(expect.schemaMatching(SBackup))
    expect({
      ...base,
      status: 'available',
      completedAt: '2026-08-24T00:01:00Z',
      phase: 'capturing_sqlite',
      cleanupPending: false,
    }).not.toEqual(expect.schemaMatching(SBackup))
    expect({
      id: 'backup-1',
      status: 'creating',
      createdAt: '2026-08-24T00:00:00Z',
      completedAt: null,
      scope: 'installation',
      phase: 'capturing_sqlite',
      cleanupPending: false,
      errorCode: null,
    }).not.toEqual(expect.schemaMatching(SBackup))
  })
})

describe('batch ingestion results', () => {
  it('keeps policy refusals generic and item errors bounded', () => {
    expect({
      status: 'rejected',
      eventId: 'event-1',
      reason: 'policy',
    }).toEqual(expect.schemaMatching(SBatchEventResult))
    expect({
      status: 'rejected',
      eventId: 'event-1',
      reason: 'bot',
    }).not.toEqual(expect.schemaMatching(SBatchEventResult))
    expect({
      status: 'itemError',
      eventId: 'event-1',
      code: 'CONFLICT',
    }).toEqual(expect.schemaMatching(SBatchEventResult))
    expect({
      status: 'itemError',
      eventId: null,
      code: 'FORBIDDEN',
    }).not.toEqual(expect.schemaMatching(SBatchEventResult))
  })
})
