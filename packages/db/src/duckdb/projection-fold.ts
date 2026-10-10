import type { DuckDBValue } from '@duckdb/node-api'
import { getNestedMapValue, setNestedMapValue } from '@cimi/utils'
import type { ProjectedEventRow } from './projection-source.ts'

export interface VisitorRow {
  siteId: string
  visitorId: string
  identityKind: 'anonymous' | 'identified'
  profileId: string | null
  firstSeenAt: number
  lastSeenAt: number
}

export interface SessionRow {
  siteId: string
  sessionId: string
  visitorId: string | null
  identifiedUserId: string | null
  startedAt: number
  endedAt: number
  entryPage: string | null
  referrer: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  device: string | null
  browser: string | null
  operatingSystem: string | null
  country: string | null
}

export interface FactFoldState {
  readonly visitors: Map<string, Map<string, VisitorRow>>
  readonly sessions: Map<string, Map<string, SessionRow>>
}

export type FactFoldRowReader = (
  sql: string,
  args: readonly string[],
) => Promise<readonly Record<string, DuckDBValue>[]>

export interface FactFoldSeedInput {
  readonly siteId: string
  readonly visitorIds: readonly string[]
  readonly sessionIds: readonly string[]
  readonly read: FactFoldRowReader
}

const VISITOR_SEED_COLUMNS =
  'site_id, visitor_id, identity_kind, epoch_ms(first_seen_at) AS first_seen_at, epoch_ms(last_seen_at) AS last_seen_at, profile_id'

const SESSION_SEED_COLUMNS =
  'site_id, session_id, visitor_id, identified_user_id, epoch_ms(started_at) AS started_at, epoch_ms(ended_at) AS ended_at, entry_page, referrer, utm_source, utm_medium, utm_campaign, device, browser, operating_system, country'

const VISITOR_SEED_CLAUSE = ' AND visitor_id IN '

const SESSION_SEED_CLAUSE = ' AND session_id IN '

export function createFactFoldState(): FactFoldState {
  return { visitors: new Map(), sessions: new Map() }
}

export function foldVisitorRows(state: FactFoldState): VisitorRow[] {
  return [...state.visitors.values()].flatMap((nested) => [...nested.values()])
}

export function foldSessionRows(state: FactFoldState): SessionRow[] {
  return [...state.sessions.values()].flatMap((nested) => [...nested.values()])
}

export async function seedFactFoldState(
  state: FactFoldState,
  input: FactFoldSeedInput,
): Promise<void> {
  if (input.visitorIds.length > 0) {
    const rows = await input.read(visitorSeedSql(input.visitorIds.length), [
      input.siteId,
      ...input.visitorIds,
    ])

    for (const row of rows) {
      const siteId = String(row['site_id'])
      const visitorId = String(row['visitor_id'])

      setNestedMapValue(state.visitors, siteId, visitorId, {
        siteId,
        visitorId,
        identityKind: row['identity_kind'] === 'identified' ? 'identified' : 'anonymous',
        profileId: nullableText(row['profile_id']),
        firstSeenAt: requiredMs(row['first_seen_at'], 'visitor first seen at'),
        lastSeenAt: requiredMs(row['last_seen_at'], 'visitor last seen at'),
      })
    }
  }

  if (input.sessionIds.length > 0) {
    const rows = await input.read(sessionSeedSql(input.sessionIds.length), [
      input.siteId,
      ...input.sessionIds,
    ])

    for (const row of rows) {
      const siteId = String(row['site_id'])
      const sessionId = String(row['session_id'])

      setNestedMapValue(state.sessions, siteId, sessionId, {
        siteId,
        sessionId,
        visitorId: nullableText(row['visitor_id']),
        identifiedUserId: nullableText(row['identified_user_id']),
        startedAt: requiredMs(row['started_at'], 'session start'),
        endedAt: requiredMs(row['ended_at'], 'session end'),
        entryPage: nullableText(row['entry_page']),
        referrer: nullableText(row['referrer']),
        utmSource: nullableText(row['utm_source']),
        utmMedium: nullableText(row['utm_medium']),
        utmCampaign: nullableText(row['utm_campaign']),
        device: nullableText(row['device']),
        browser: nullableText(row['browser']),
        operatingSystem: nullableText(row['operating_system']),
        country: nullableText(row['country']),
      })
    }
  }
}

export function foldProjectedEvent(state: FactFoldState, event: ProjectedEventRow): void {
  if (event.visitorId !== null) {
    const visitor = getNestedMapValue(state.visitors, event.siteId, event.visitorId)

    if (visitor === undefined) {
      setNestedMapValue(state.visitors, event.siteId, event.visitorId, {
        siteId: event.siteId,
        visitorId: event.visitorId,
        identityKind: event.identifiedUserId === null ? 'anonymous' : 'identified',
        profileId: event.profileId,
        firstSeenAt: event.occurrenceTime,
        lastSeenAt: event.occurrenceTime,
      })
    } else {
      visitor.firstSeenAt = Math.min(visitor.firstSeenAt, event.occurrenceTime)
      visitor.lastSeenAt = Math.max(visitor.lastSeenAt, event.occurrenceTime)

      if (event.identifiedUserId !== null) visitor.identityKind = 'identified'

      if (event.profileId !== null) {
        if (visitor.profileId === null) visitor.profileId = event.profileId
        else if (visitor.profileId !== event.profileId) visitor.profileId = null
      }
    }
  }

  if (event.analyticsSessionId !== null) {
    const session = getNestedMapValue(state.sessions, event.siteId, event.analyticsSessionId)

    if (session === undefined) {
      setNestedMapValue(state.sessions, event.siteId, event.analyticsSessionId, {
        siteId: event.siteId,
        sessionId: event.analyticsSessionId,
        visitorId: event.visitorId,
        identifiedUserId: event.identifiedUserId,
        startedAt: event.occurrenceTime,
        endedAt: event.occurrenceTime,
        entryPage: event.pagePath,
        referrer: event.referrer,
        utmSource: event.utmSource,
        utmMedium: event.utmMedium,
        utmCampaign: event.utmCampaign,
        device: event.deviceType,
        browser: event.browserType,
        operatingSystem: event.operatingSystem,
        country: event.country,
      })
    } else {
      const earlier = event.occurrenceTime < session.startedAt
      session.startedAt = Math.min(session.startedAt, event.occurrenceTime)
      session.endedAt = Math.max(session.endedAt, event.occurrenceTime)

      if (session.visitorId === null) session.visitorId = event.visitorId

      if (session.identifiedUserId === null) session.identifiedUserId = event.identifiedUserId

      if (earlier || session.entryPage === null) session.entryPage = event.pagePath

      if (earlier || session.referrer === null) session.referrer = event.referrer

      if (earlier || session.utmSource === null) session.utmSource = event.utmSource

      if (earlier || session.utmMedium === null) session.utmMedium = event.utmMedium

      if (earlier || session.utmCampaign === null) session.utmCampaign = event.utmCampaign

      if (earlier || session.device === null) session.device = event.deviceType

      if (earlier || session.browser === null) session.browser = event.browserType

      if (earlier || session.operatingSystem === null)
        session.operatingSystem = event.operatingSystem

      if (earlier || session.country === null) session.country = event.country
    }
  }
}

function visitorSeedSql(idCount: number): string {
  return (
    'SELECT ' +
    VISITOR_SEED_COLUMNS +
    ' FROM visitors WHERE site_id = ?' +
    VISITOR_SEED_CLAUSE +
    '(' +
    placeholders(idCount) +
    ') ORDER BY visitor_id'
  )
}

function sessionSeedSql(idCount: number): string {
  return (
    'SELECT ' +
    SESSION_SEED_COLUMNS +
    ' FROM analytics_sessions WHERE site_id = ?' +
    SESSION_SEED_CLAUSE +
    '(' +
    placeholders(idCount) +
    ') ORDER BY session_id'
  )
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

function nullableText(value: DuckDBValue | undefined): string | null {
  return value === null || value === undefined ? null : String(value)
}

function requiredMs(value: DuckDBValue | undefined, field: string): number {
  if (value === null || value === undefined) {
    throw new Error('Analytics ' + field + ' is missing from the fact fold seed')
  }

  return Number(value)
}
