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

function dayTwoPeriod() {
  return resolveReportPeriods({
    metadata: {
      siteId: createSiteId(SITE),
      reportingTimezone: 'UTC',
      weekStartsOn: 'monday',
    },
    current: {
      fromDate: createCalendarDate('2026-09-06'),
      toDate: createCalendarDate('2026-09-06'),
    },
  }).current
}

function createQuery(analytics: DuckDbReportingQueryDependencies['analytics']) {
  return new DuckDbReportingQuery({ analytics })
}

interface BreakdownSeedEvent {
  readonly session: string
  readonly visitor: string
  readonly kind: string
  readonly at: number
  readonly pagePath?: string | undefined
  readonly device?: string | null | undefined
  readonly browser?: string | null | undefined
  readonly os?: string | null | undefined
  readonly country?: string | null | undefined
  readonly referrer?: string | null | undefined
  readonly utmSource?: string | null | undefined
  readonly utmMedium?: string | null | undefined
  readonly utmCampaign?: string | null | undefined
}

/**
 * Seeds attributed accepted events so the projection writes session attribution columns. The first
 * event of a Session (earliest occurrence) supplies entry_page and the attribution columns.
 */
function seedBreakdownEvents(db: Db, events: readonly BreakdownSeedEvent[]): void {
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
    `INSERT INTO accepted_event (
       event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id,
       analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint,
       projection_state, created_at, device_type, browser, operating_system, country,
       utm_source, utm_medium, utm_campaign
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const insertPageView = db.$client.prepare(
    `INSERT INTO event_page_view (event_pk, page_path, referrer)
     SELECT event_pk, ?, ? FROM accepted_event WHERE site_id = ? AND event_id = ?`,
  )
  let sequence = 0
  for (const event of events) {
    sequence += 1
    const eventId = `evt-${sequence}`
    insertEvent.run(
      sequence,
      SITE,
      eventId,
      event.kind,
      event.at,
      event.at,
      event.visitor,
      event.session,
      'pol-1',
      sequence,
      `fp-${sequence}`,
      'pending',
      event.at,
      event.device ?? null,
      event.browser ?? null,
      event.os ?? null,
      event.country ?? null,
      event.utmSource ?? null,
      event.utmMedium ?? null,
      event.utmCampaign ?? null,
    )
    if (event.pagePath !== undefined) {
      insertPageView.run(event.pagePath, event.referrer ?? null, SITE, eventId)
    }
  }

  db.$client
    .prepare(
      'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, occurrence_covered_from, occurrence_covered_through, statistics_refreshed_at, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(SITE, sequence, DAY_ONE, DAY_TWO + 3_000, now, 'ready', 'v5', now)
}

const ATTRIBUTED_DAY = DAY_ONE + 10 * 60 * 60 * 1000

function attributedEvents(): readonly BreakdownSeedEvent[] {
  return [
    {
      session: 's1',
      visitor: 'v1',
      kind: 'page_view',
      at: ATTRIBUTED_DAY,
      pagePath: '/a',
      device: 'desktop',
      browser: 'chrome',
      os: 'macos',
      country: 'US',
      referrer: 'https://search.example',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'launch',
    },
    {
      session: 's2',
      visitor: 'v2',
      kind: 'page_view',
      at: ATTRIBUTED_DAY + 1,
      pagePath: '/a',
      device: 'desktop',
      browser: 'firefox',
      os: 'linux',
      country: 'US',
      utmSource: 'newsletter',
      utmMedium: 'email',
    },
    {
      session: 's3',
      visitor: 'v3',
      kind: 'page_view',
      at: ATTRIBUTED_DAY + 2,
      pagePath: '/a',
      device: 'mobile',
      browser: 'safari',
      os: 'ios',
      country: 'CA',
    },
    {
      session: 's3',
      visitor: 'v3',
      kind: 'page_view',
      at: ATTRIBUTED_DAY + 3,
      pagePath: '/b',
    },
    { session: 's4', visitor: 'v4', kind: 'page_view', at: ATTRIBUTED_DAY + 4, pagePath: '/b' },
    { session: 's5', visitor: 'v5', kind: 'page_view', at: ATTRIBUTED_DAY + 5, pagePath: '/b' },
  ]
}

function breakdownPeriod() {
  return periods().current
}

interface EventKindSeed {
  readonly id: string
  readonly session: string
  readonly visitor: string
  readonly kind: string
  readonly at: number
  readonly pagePath?: string | undefined
  readonly referrer?: string | null | undefined
  readonly name?: string | undefined
  readonly destination?: string | undefined
  readonly value?: number | undefined
  readonly unit?: string | null | undefined
  readonly code?: string | null | undefined
  readonly message?: string | null | undefined
  readonly properties?: Readonly<Record<string, string | number | boolean | null>> | undefined
}

function seedEventKindEvents(db: Db, events: readonly EventKindSeed[]): void {
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
    `INSERT INTO accepted_event (
       event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id,
       analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint,
       projection_state, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  )
  const insertPageView = db.$client.prepare(
    'INSERT INTO event_page_view (event_pk, page_path, referrer) VALUES (?, ?, ?)',
  )
  const insertProperty = db.$client.prepare(
    'INSERT INTO event_property (event_pk, property_key, value_type, string_value, number_value, boolean_value) VALUES (?, ?, ?, ?, ?, ?)',
  )

  let sequence = 0
  let eventPk = 0
  for (const event of events) {
    sequence += 1
    eventPk += 1
    insertEvent.run(
      eventPk,
      SITE,
      event.id,
      event.kind,
      event.at,
      event.at,
      event.visitor,
      event.session,
      'pol-1',
      sequence,
      `fp-${sequence}`,
      event.at,
    )
    if (event.pagePath !== undefined) {
      insertPageView.run(eventPk, event.pagePath, event.referrer ?? null)
    }
    if (event.kind === 'custom_event') {
      db.$client
        .prepare('INSERT INTO event_custom (event_pk, name) VALUES (?, ?)')
        .run(eventPk, event.name ?? '')
    }
    if (event.kind === 'outbound') {
      db.$client
        .prepare('INSERT INTO event_outbound (event_pk, destination, name) VALUES (?, ?, ?)')
        .run(eventPk, event.destination ?? '', event.name ?? null)
    }
    if (event.kind === 'performance') {
      db.$client
        .prepare('INSERT INTO event_performance (event_pk, name, value, unit) VALUES (?, ?, ?, ?)')
        .run(eventPk, event.name ?? '', event.value ?? 0, event.unit ?? null)
    }
    if (event.kind === 'error') {
      db.$client
        .prepare('INSERT INTO event_error (event_pk, name, code, message) VALUES (?, ?, ?, ?)')
        .run(eventPk, event.name ?? '', event.code ?? null, event.message ?? null)
    }
    for (const [key, value] of Object.entries(event.properties ?? {})) {
      if (value === null) {
        insertProperty.run(eventPk, key, 'null', null, null, null)
      } else if (typeof value === 'number') {
        insertProperty.run(eventPk, key, 'number', null, value, null)
      } else if (typeof value === 'boolean') {
        insertProperty.run(eventPk, key, 'boolean', null, null, value ? 1 : 0)
      } else {
        insertProperty.run(eventPk, key, 'string', value, null, null)
      }
    }
  }

  db.$client
    .prepare(
      'INSERT INTO projection_checkpoint (site_id, projected_replay_sequence, occurrence_covered_from, occurrence_covered_through, statistics_refreshed_at, readiness, projection_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(SITE, sequence, DAY_ONE, DAY_TWO + 86_400_000, now, 'ready', 'v5', now)
}

const EVENT_DAY = DAY_ONE + 10 * 60 * 60 * 1000

function eventKindSeeds(): readonly EventKindSeed[] {
  return [
    {
      id: 'evt-1',
      session: 's1',
      visitor: 'v1',
      kind: 'page_view',
      at: EVENT_DAY,
      pagePath: '/a',
      referrer: 'https://ref.example',
      properties: { plan: 'pro', score: 5, active: true, note: null },
    },
    {
      id: 'evt-2',
      session: 's1',
      visitor: 'v1',
      kind: 'page_view',
      at: EVENT_DAY + 1_000,
      pagePath: '/b',
      referrer: null,
    },
    {
      id: 'evt-3',
      session: 's2',
      visitor: 'v2',
      kind: 'custom_event',
      at: EVENT_DAY + 2_000,
      pagePath: '/b',
      name: 'checkout',
    },
    {
      id: 'evt-4',
      session: 's2',
      visitor: 'v2',
      kind: 'outbound',
      at: EVENT_DAY + 3_000,
      pagePath: '/b',
      name: 'click',
      destination: 'https://out.example',
    },
    {
      id: 'evt-5',
      session: 's3',
      visitor: 'v3',
      kind: 'performance',
      at: EVENT_DAY + 4_000,
      pagePath: '/c',
      name: 'lcp',
      value: 1.5,
      unit: 's',
    },
    {
      id: 'evt-6',
      session: 's3',
      visitor: 'v3',
      kind: 'error',
      at: EVENT_DAY + 5_000,
      pagePath: '/c',
      name: 'TypeError',
      code: 'E1',
      message: 'boom',
    },
    {
      id: 'evt-7',
      session: 's4',
      visitor: 'v4',
      kind: 'error',
      at: EVENT_DAY + 6_000,
      pagePath: '/c',
      name: 'RangeError',
      code: null,
      message: null,
    },
  ]
}

function eventPeriod() {
  return periods().current
}

describe('DuckDbReportingQuery.eventOverview', () => {
  it('counts total, distinct visitors, and distinct sessions for one kind', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const pageView = await createQuery(analytics).eventOverview({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        filterPlan: emptyPlan,
      })
      expect(pageView).toEqual({ total: 2, uniqueVisitors: 1, uniqueSessions: 1 })

      const error = await createQuery(analytics).eventOverview({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'error',
        filterPlan: emptyPlan,
      })
      expect(error).toEqual({ total: 2, uniqueVisitors: 2, uniqueSessions: 2 })

      const missing = await createQuery(analytics).eventOverview({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'outbound',
        filterPlan: {
          ...emptyPlan,
          event: [{ target: 'event.name', propertyKey: null, operator: 'eq', bind: ['nope'] }],
        },
      })
      expect(missing).toEqual({ total: 0, uniqueVisitors: 0, uniqueSessions: 0 })
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

describe('DuckDbReportingQuery.eventBuckets', () => {
  it('returns sparse per-bucket counts for the requested kind only', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const buckets = await createQuery(analytics).eventBuckets({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        filterPlan: emptyPlan,
      })
      expect(buckets).toEqual([{ at: createInstantMs(DAY_ONE), count: 2 }])
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

describe('DuckDbReportingQuery.eventRows', () => {
  it('orders by occurrence time with an event_id tie-break and counts distinct event ids', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).eventRows({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'error',
        filterPlan: emptyPlan,
        direction: 'asc',
        offset: 0,
        limit: 10,
      })
      expect(result.totalCount).toBe(2)
      expect(result.rows.map((row) => row.eventId)).toEqual(['evt-6', 'evt-7'])
      expect(result.rows[0]).toMatchObject({
        eventId: 'evt-6',
        kind: 'error',
        name: 'TypeError',
        code: 'E1',
        message: 'boom',
        occurredAt: createInstantMs(EVENT_DAY + 5_000),
        createdAt: createInstantMs(EVENT_DAY + 5_000),
      })
      expect(result.rows[1]).toMatchObject({ code: null, message: null, properties: null })
      expect(result.hasMore).toBe(false)
      expect(result.nextOffset).toBeNull()
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('orders ascending and descending by occurrence time across all kinds', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const base = {
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view' as const,
        filterPlan: emptyPlan,
        offset: 0,
        limit: 10,
      }
      const ascending = await createQuery(analytics).eventRows({ ...base, direction: 'asc' })
      expect(ascending.rows.map((row) => row.eventId)).toEqual(['evt-1', 'evt-2'])
      expect(ascending.rows[0]).toMatchObject({
        kind: 'page_view',
        pagePath: '/a',
        referrer: 'https://ref.example',
        name: null,
        destination: null,
        value: null,
        unit: null,
        code: null,
        message: null,
        properties: { plan: 'pro', score: 5, active: true, note: null },
      })
      expect(ascending.rows[1]).toMatchObject({ pagePath: '/b', referrer: null, properties: null })

      const descending = await createQuery(analytics).eventRows({ ...base, direction: 'desc' })
      expect(descending.rows.map((row) => row.eventId)).toEqual(['evt-2', 'evt-1'])
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('pages across the distinct-event set with an occurrence tie-break', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const first = await createQuery(analytics).eventRows({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        filterPlan: emptyPlan,
        direction: 'asc',
        offset: 0,
        limit: 1,
      })
      expect(first.rows.map((row) => row.eventId)).toEqual(['evt-1'])
      expect(first.totalCount).toBe(2)
      expect(first.hasMore).toBe(true)
      expect(first.nextOffset).toBe(1)

      const second = await createQuery(analytics).eventRows({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        filterPlan: emptyPlan,
        direction: 'asc',
        offset: 1,
        limit: 1,
      })
      expect(second.rows.map((row) => row.eventId)).toEqual(['evt-2'])
      expect(second.hasMore).toBe(false)
      expect(second.nextOffset).toBeNull()
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

describe('DuckDbReportingQuery.eventBreakdown', () => {
  it('groups by kind, excludes empty values, and counts accepted events', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const byKind = await createQuery(analytics).eventBreakdown({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        field: 'kind',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(byKind.rows).toEqual([{ value: 'page_view', count: 2 }])
      expect(byKind.totalCount).toBe(1)

      const byName = await createQuery(analytics).eventBreakdown({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        field: 'pagePath',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(byName.rows).toEqual([
        { value: '/a', count: 1 },
        { value: '/b', count: 1 },
      ])
      expect(byName.totalCount).toBe(2)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('sorts by count descending with a value tie-break and paginates', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEventKindEvents(controlDb, eventKindSeeds())
      await analytics.rebuild({ controlDb })

      const first = await createQuery(analytics).eventBreakdown({
        siteId: createSiteId(SITE),
        period: eventPeriod(),
        eventKind: 'page_view',
        field: 'pagePath',
        sort: 'value',
        direction: 'desc',
        offset: 0,
        limit: 1,
        filterPlan: emptyPlan,
      })
      expect(first.rows).toEqual([{ value: '/b', count: 1 }])
      expect(first.totalCount).toBe(2)
      expect(first.hasMore).toBe(true)
      expect(first.nextOffset).toBe(1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

describe('DuckDbReportingQuery.trafficBreakdown', () => {
  it('groups page rows by distinct sessions that viewed each path', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedBreakdownEvents(controlDb, attributedEvents())
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'page',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })

      expect(result.rows).toEqual([
        { value: '/a', count: 3 },
        { value: '/b', count: 3 },
      ])
      expect(result.totalCount).toBe(2)
      expect(result.denominator).toBe(5)
      expect(result.hasMore).toBe(false)
      expect(result.nextOffset).toBeNull()
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('groups entry_page and excludes NULL session attribution from the rows', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedBreakdownEvents(controlDb, attributedEvents())
      await analytics.rebuild({ controlDb })

      const entry = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'entry_page',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(entry.rows).toEqual([
        { value: '/a', count: 3 },
        { value: '/b', count: 2 },
      ])
      expect(entry.denominator).toBe(5)

      const device = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'device',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(device.rows).toEqual([
        { value: 'desktop', count: 2 },
        { value: 'mobile', count: 1 },
      ])
      expect(device.totalCount).toBe(2)
      expect(device.denominator).toBe(5)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('orders by count descending with a value tie-break and paginates deterministically', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedBreakdownEvents(controlDb, attributedEvents())
      await analytics.rebuild({ controlDb })

      const first = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'page',
        sort: 'count',
        direction: 'desc',
        offset: 0,
        limit: 1,
        filterPlan: emptyPlan,
      })
      expect(first.rows).toEqual([{ value: '/a', count: 3 }])
      expect(first.totalCount).toBe(2)
      expect(first.hasMore).toBe(true)
      expect(first.nextOffset).toBe(1)

      const second = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'page',
        sort: 'count',
        direction: 'desc',
        offset: first.nextOffset ?? -1,
        limit: 1,
        filterPlan: emptyPlan,
      })
      expect(second.rows).toEqual([{ value: '/b', count: 3 }])
      expect(second.hasMore).toBe(false)
      expect(second.nextOffset).toBeNull()
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('returns an empty page for exit_page and region while keeping the session denominator', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedBreakdownEvents(controlDb, attributedEvents())
      await analytics.rebuild({ controlDb })

      const exit = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'exit_page',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(exit.rows).toEqual([])
      expect(exit.totalCount).toBe(0)
      expect(exit.denominator).toBe(5)

      const region = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'region',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })
      expect(region.rows).toEqual([])
      expect(region.totalCount).toBe(0)
      expect(region.denominator).toBe(5)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('combines non-null utm parts into one value and drops the all-null row', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedBreakdownEvents(controlDb, attributedEvents())
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'utm',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })

      expect(result.rows).toEqual([
        { value: 'newsletter / email', count: 1 },
        { value: 'newsletter / email / launch', count: 1 },
      ])
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('clamps each value to the contract maximum length', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      const longPath = `/${'x'.repeat(3000)}`
      seedBreakdownEvents(controlDb, [
        { session: 's1', visitor: 'v1', kind: 'page_view', at: ATTRIBUTED_DAY, pagePath: longPath },
      ])
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficBreakdown({
        siteId: createSiteId(SITE),
        period: breakdownPeriod(),
        dimension: 'page',
        sort: 'value',
        direction: 'asc',
        offset: 0,
        limit: 10,
        filterPlan: emptyPlan,
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0]!.value).toHaveLength(2048)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

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

      // The predicate scopes which Sessions the report considers; the bounce and duration rules
      // still read each Session's full event history, so s3/s5/s6 keep the engagement events that
      // disqualify them and only s2 remains a bounce.
      expect(result.metrics.pageviews).toBe(8)
      expect(result.metrics.sessions).toBe(6)
      expect(result.metrics.bouncedSessions).toBe(1)
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

describe('presence filters', () => {
  it('scopes a visitor has_done filter to sessions whose visitor performed the action', async () => {
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
          sessionPresence: [
            {
              scope: 'visitor',
              withinPeriod: false,
              action: 'custom_event',
              name: null,
              propertyFilters: [],
              negated: false,
            },
          ],
        },
      })

      expect(result.metrics.sessions).toBe(1)
      expect(result.metrics.visitors).toBe(1)
      expect(result.metrics.pageviews).toBe(1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('negates a visitor has_done filter with has_not_done', async () => {
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
          sessionPresence: [
            {
              scope: 'visitor',
              withinPeriod: false,
              action: 'custom_event',
              name: null,
              propertyFilters: [],
              negated: true,
            },
          ],
        },
      })

      expect(result.metrics.sessions).toBe(5)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })

  it('bounds a session same_range presence filter to the report window', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEvents(controlDb)
      await analytics.rebuild({ controlDb })

      const scoped = await createQuery(analytics).eventOverview({
        siteId: createSiteId(SITE),
        period: periods().current,
        eventKind: 'custom_event',
        filterPlan: {
          ...emptyPlan,
          sessionPresence: [
            {
              scope: 'session',
              withinPeriod: true,
              action: 'custom_event',
              name: null,
              propertyFilters: [],
              negated: false,
            },
          ],
        },
      })

      expect(scoped.total).toBe(1)
      expect(scoped.uniqueSessions).toBe(1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})

describe('session span across the window boundary', () => {
  it('measures a Session span over its full history, not only in-window events', async () => {
    const controlDb = createMigratedTestDb()
    const analytics = await createTestAnalyticsDb()
    try {
      seedEvents(controlDb)
      const laterInWindow = DAY_TWO + 11 * 60 * 60 * 1000
      const insertEvent = controlDb.$client.prepare(
        'INSERT INTO accepted_event (event_pk, site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id, analytics_session_id, policy_revision_id, replay_sequence, payload_fingerprint, projection_state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      insertEvent.run(
        900,
        SITE,
        'evt-900',
        'page_view',
        laterInWindow,
        laterInWindow,
        'v1',
        's1',
        'pol-1',
        900,
        'fp-900',
        'pending',
        laterInWindow,
      )
      await analytics.rebuild({ controlDb })

      const result = await createQuery(analytics).trafficAggregate({
        siteId: createSiteId(SITE),
        period: dayTwoPeriod(),
        includeTrend: false,
        filterPlan: emptyPlan,
      })

      // Three Sessions touch DAY_TWO: s1 (the added event), s2, and s3. s1's span reads its full
      // history, so it runs from its DAY_ONE events to the DAY_TWO event even though only the
      // DAY_TWO event falls inside the period.
      expect(result.metrics.sessions).toBe(3)
      expect(result.metrics.sessionsWithValidDuration).toBe(2)
      expect(result.metrics.totalSessionDurationMs).toBe(
        laterInWindow - (DAY_ONE + 10 * 60 * 60 * 1000) + 1_000,
      )
      expect(result.metrics.bouncedSessions).toBe(1)
    } finally {
      await analytics.close()
      closeDb(controlDb)
    }
  })
})
