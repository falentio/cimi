import { describe, expect, it } from 'vitest'
import type { Db } from '../../client.ts'
import { closeDb } from '../../client.ts'
import { createMigratedTestDb, createTestAnalyticsDb } from '../../testing/index.ts'
import { DuckDbReportingQuery, type DuckDbReportingQueryDependencies } from '../reporting-query.ts'
import {
  createCalendarDate,
  createInstantMs,
  createSiteId,
  resolveReportPeriods,
  type ReportFilterPlan,
} from '@cimi/kernel'

const SITE = 'ste-1'
const DAY_ONE = Date.parse('2026-09-05T00:00:00.000Z')
const DAY_TWO = Date.parse('2026-09-06T00:00:00.000Z')

const emptyPlan: ReportFilterPlan = {
  event: [],
  session: [],
  visitor: [],
  profile: [],
  profileTraitKeys: [],
  sessionPresence: [],
  requiresProfileJoin: false,
}

/**
 * A Site whose six Sessions exercise each metric rule: distinct visitors and sessions, eligibility
 * (a page_view), valid duration (>= 2 events), and the bounce rule (exactly one page_view, no
 * engagement kind, span < 10s).
 */
function seedEvents(db: Db): void {
  const now = DAY_ONE
  db.$client
    .prepare(
      'INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('user-1', 'User', 'user@example.com', 1, now, now)
  db.$client
    .prepare(
      'INSERT INTO organization (id, name, owner_user_id, is_personal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('org-1', 'Organization', 'user-1', 0, now, now)
  db.$client
    .prepare(
      'INSERT INTO site (id, organization_id, name, hostname, ingestion_identifier, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(SITE, 'org-1', 'Site', 'example.com', 'ing-1', now, now)
  db.$client
    .prepare(
      'INSERT INTO installation (id, status, data_directory_ready, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    )
    .run('ins-1', 'ready', 1, now, now)
  db.$client
    .prepare(
      'INSERT INTO collection_policy_revision (id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('pol-1', 'ins-1', 'installation', 1, '{}', now, now, now)
  db.$client
    .prepare(
      'INSERT INTO retention_policy (id, installation_id, scope, event_months, profile_months, version, status, effective_from, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('rtn-1', 'ins-1', 'installation', 1, 1, 1, 'active', now, now, now)
  db.$client
    .prepare(
      'INSERT INTO retention_effective_cutoff (site_id, installation_id, policy_id, reporting_timezone, local_day, event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at, effective_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      SITE,
      'ins-1',
      'rtn-1',
      'UTC',
      '2026-09-05',
      DAY_ONE - 1,
      DAY_ONE - 1,
      DAY_ONE - 1,
      now,
      now,
    )

  const insertEvent = db.$client.prepare(
    'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  let sequence = 0
  const add = (session: string, visitor: string, kind: string, at: number): void => {
    sequence += 1
    insertEvent.run(
      sequence,
      SITE,
      `evt-${sequence}`,
      kind,
      at,
      at,
      visitor,
      session,
      'pol-1',
      sequence,
      `fp-${sequence}`,
      'pending',
      at,
    )
  }

  const d1 = DAY_ONE + 10 * 60 * 60 * 1000
  const d2 = DAY_TWO + 10 * 60 * 60 * 1000

  add('s1', 'v1', 'page_view', d1)
  add('s1', 'v1', 'page_view', d1 + 5_000)
  add('s2', 'v2', 'page_view', d2 + 1_000)
  add('s3', 'v3', 'page_view', d2 + 2_000)
  add('s3', 'v3', 'custom_event', d2 + 3_000)
  add('s4', 'v4', 'page_view', d1 + 1_000)
  add('s4', 'v4', 'page_view', d1 + 12_000)
  add('s5', 'v5', 'page_view', d1)
  add('s5', 'v5', 'outbound', d1 + 1_000)
  add('s6', 'v6', 'page_view', d1)
  add('s6', 'v6', 'performance', d1 + 11_000)

  db.$client
    .prepare(
      'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, occurrence_covered_from, occurrence_covered_through, statistics_refreshed_at, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(SITE, sequence, d1, d2 + 3_000, now, 'ready', 'v5', now)
}

function periods() {
  return resolveReportPeriods({
    metadata: {
      siteId: createSiteId(SITE),
      reportingTimezone: 'UTC',
      weekStartsOn: 'monday',
    },
    current: {
      fromDate: createCalendarDate('2026-09-05'),
      toDate: createCalendarDate('2026-09-06'),
    },
    bucket: { granularity: 'day', maxStarts: 366 },
  })
}

function createQuery(analytics: DuckDbReportingQueryDependencies['analytics']) {
  return new DuckDbReportingQuery({ analytics })
}

describe('DuckDbReportingQuery.trafficAggregate', () => {
  it('aggregates facts and sparse trend buckets over the resolved window', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEvents(controlDb)
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficAggregate({
        siteId: createSiteId(SITE),
        period: periods().current,
        includeTrend: true,
        filterPlan: emptyPlan,
      })

      expect(result.metrics).toEqual({
        visitors: 6,
        sessions: 6,
        pageviews: 8,
        eligibleSessions: 6,
        sessionsWithValidDuration: 5,
        bouncedSessions: 1,
        totalSessionDurationMs: 29_000,
      })
      expect(result.trend).toEqual([
        { at: createInstantMs(DAY_ONE), visitors: 4 },
        { at: createInstantMs(DAY_TWO), visitors: 2 },
      ])
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('omits the trend when the caller does not request it', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEvents(controlDb)
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficAggregate({
        siteId: createSiteId(SITE),
        period: periods().current,
        includeTrend: false,
        filterPlan: emptyPlan,
      })

      expect(result.trend).toEqual([])
      expect(result.metrics.visitors).toBe(6)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('applies an event predicate without leaking values into SQL', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEvents(controlDb)
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficAggregate({
        siteId: createSiteId(SITE),
        period: periods().current,
        includeTrend: false,
        filterPlan: {
          ...emptyPlan,
          event: [{ target: 'event.kind', propertyKey: null, operator: 'eq', bind: ['page_view'] }],
        },
      })

      // Dropping every non page_view event leaves sessions s3, s5, and s6 as single-page_view
      // sessions with a zero span, so the bounce count grows to the four single-page sessions.
      expect(result.metrics.pageviews).toBe(8)
      expect(result.metrics.sessions).toBe(6)
      expect(result.metrics.bouncedSessions).toBe(4)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('rejects a profile filter instead of silently ignoring it', async () => {
    const analytics = await createTestAnalyticsDb()
    try {
      await expect(
        createQuery(analytics).trafficAggregate({
          siteId: createSiteId(SITE),
          period: periods().current,
          includeTrend: false,
          filterPlan: {
            ...emptyPlan,
            profile: [
              { target: 'profile.trait', propertyKey: 'plan', operator: 'eq', bind: ['pro'] },
            ],
            profileTraitKeys: ['plan'],
            requiresProfileJoin: true,
          },
        }),
      ).rejects.toThrow(/profile join/)
    } finally {
      await analytics.close()
    }
  })
})
