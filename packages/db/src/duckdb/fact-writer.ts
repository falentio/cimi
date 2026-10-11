import { DuckDBTimestampValue } from '@duckdb/node-api'
import type { SessionRow, VisitorRow } from './projection-fold.ts'
import type { PropertyRow, ProjectedEventRow } from './projection-source.ts'

export type FactPropertyValue = string | number | boolean | null

export interface FactAppender {
  readonly columnCount: number
  appendBigInt(value: bigint): void
  appendVarchar(value: string): void
  appendTimestamp(value: DuckDBTimestampValue): void
  appendBoolean(value: boolean): void
  appendDouble(value: number): void
  appendNull(): void
  endRow(): void
  closeSync(): void
}

export interface FactAppenderConnection {
  createAppender(table: string): Promise<FactAppender>
}

export const EVENT_APPEND_COLUMNS = [
  'event_pk',
  'site_id',
  'event_id',
  'event_kind',
  'occurrence_time',
  'receipt_time',
  'late',
  'visitor_id',
  'identified_user_id',
  'analytics_session_id',
  'page_path',
  'referrer',
  'name',
  'destination',
  'value',
  'unit',
  'code',
  'message',
  'properties_json',
  'policy_revision_id',
  'replay_sequence',
  'payload_fingerprint',
  'projected_at',
  'anonymous_identity_id',
  'bot_policy_outcome',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'device',
  'browser',
  'operating_system',
  'country',
] as const

export const EVENT_PROPERTY_APPEND_COLUMNS = [
  'site_id',
  'event_id',
  'property_key',
  'value_type',
  'string_value',
  'number_value',
  'boolean_value',
] as const

export const VISITOR_APPEND_COLUMNS = [
  'site_id',
  'visitor_id',
  'identity_kind',
  'first_seen_at',
  'last_seen_at',
  'profile_id',
] as const

export const SESSION_APPEND_COLUMNS = [
  'site_id',
  'session_id',
  'visitor_id',
  'identified_user_id',
  'started_at',
  'ended_at',
  'entry_page',
  'referrer',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'device',
  'browser',
  'operating_system',
  'country',
  'region',
  'city',
] as const

const APPEND_COLUMNS = {
  events: EVENT_APPEND_COLUMNS,
  event_properties: EVENT_PROPERTY_APPEND_COLUMNS,
  visitors: VISITOR_APPEND_COLUMNS,
  analytics_sessions: SESSION_APPEND_COLUMNS,
} as const satisfies Record<string, readonly string[]>

export type FactTable = keyof typeof APPEND_COLUMNS

/**
 * The appender is positional, so a later ALTER TABLE that adds a column has to fail with the table
 * named rather than as an opaque incomplete-row message partway through a transaction.
 */
export function assertAppenderMatchesSchema(
  appender: Pick<FactAppender, 'columnCount'>,
  table: FactTable,
): void {
  const columns = APPEND_COLUMNS[table]

  if (appender.columnCount !== columns.length) {
    throw new Error(
      `Analytics ${table} schema changed: the appender exposes ${appender.columnCount} columns but the projection writes ${columns.length} (${columns.join(', ')})`,
    )
  }
}

export async function appendFactRows<T>(
  connection: FactAppenderConnection,
  table: FactTable,
  rows: readonly T[],
  appendRows: (appender: FactAppender, rows: readonly T[]) => Promise<void>,
): Promise<void> {
  const appender = await connection.createAppender(table)

  assertAppenderMatchesSchema(appender, table)

  try {
    await appendRows(appender, rows)
  } finally {
    appender.closeSync()
  }
}

export async function appendEventRows(
  appender: FactAppender,
  events: readonly ProjectedEventRow[],
  propertiesByEvent: ReadonlyMap<number, Record<string, FactPropertyValue>>,
): Promise<void> {
  for (const event of events) {
    appender.appendBigInt(BigInt(event.eventPk))
    appendText(appender, event.siteId)
    appendText(appender, event.eventId)
    appendText(appender, event.eventKind)
    appendTimestamp(appender, event.occurrenceTime)
    appendTimestamp(appender, event.receiptTime)
    appendBoolean(appender, Boolean(event.late))
    appendText(appender, event.visitorId)
    appendText(appender, event.identifiedUserId)
    appendText(appender, event.analyticsSessionId)
    appendText(appender, event.pagePath)
    appendText(appender, event.referrer)
    appendText(appender, event.name)
    appendText(appender, event.destination)
    appendNumber(appender, event.value)
    appendText(appender, event.unit)
    appendText(appender, event.code)
    appendText(appender, event.message)
    appendText(appender, propertiesJson(propertiesByEvent.get(event.eventPk)))
    appendText(appender, event.policyRevisionId)
    appender.appendBigInt(BigInt(event.replaySequence))
    appendText(appender, event.payloadFingerprint)
    appendTimestamp(appender, event.projectedAt)
    appendText(appender, event.anonymousIdentityId)
    appendText(appender, event.botPolicyOutcome)
    appendText(appender, event.utmSource)
    appendText(appender, event.utmMedium)
    appendText(appender, event.utmCampaign)
    appendText(appender, event.deviceType)
    appendText(appender, event.browserType)
    appendText(appender, event.operatingSystem)
    appendText(appender, event.country)

    appender.endRow()
  }
}

export async function appendPropertyRows(
  appender: FactAppender,
  properties: readonly PropertyRow[],
  writtenEvents: readonly ProjectedEventRow[],
): Promise<void> {
  const written = new Map(writtenEvents.map((event) => [event.eventPk, event]))

  for (const property of properties) {
    const event = written.get(property.eventPk)

    if (event === undefined) continue

    appendText(appender, event.siteId)
    appendText(appender, event.eventId)
    appendText(appender, property.propertyKey)
    appendText(appender, property.valueType)
    appendText(appender, property.stringValue)
    appendNumber(appender, property.numberValue)
    appendNullableBoolean(appender, property.booleanValue)

    appender.endRow()
  }
}

export async function appendVisitorRows(
  appender: FactAppender,
  visitors: readonly VisitorRow[],
): Promise<void> {
  for (const visitor of visitors) {
    appendText(appender, visitor.siteId)
    appendText(appender, visitor.visitorId)
    appendText(appender, visitor.identityKind)
    appendTimestamp(appender, visitor.firstSeenAt)
    appendTimestamp(appender, visitor.lastSeenAt)
    appendText(appender, visitor.profileId)

    appender.endRow()
  }
}

export async function appendSessionRows(
  appender: FactAppender,
  sessions: readonly SessionRow[],
): Promise<void> {
  for (const session of sessions) {
    appendText(appender, session.siteId)
    appendText(appender, session.sessionId)
    appendText(appender, session.visitorId)
    appendText(appender, session.identifiedUserId)
    appendTimestamp(appender, session.startedAt)
    appendTimestamp(appender, session.endedAt)
    appendText(appender, session.entryPage)
    appendText(appender, session.referrer)
    appendText(appender, session.utmSource)
    appendText(appender, session.utmMedium)
    appendText(appender, session.utmCampaign)
    appendText(appender, session.device)
    appendText(appender, session.browser)
    appendText(appender, session.operatingSystem)
    appendText(appender, session.country)
    appender.appendNull()
    appender.appendNull()

    appender.endRow()
  }
}

function propertiesJson(properties: Record<string, FactPropertyValue> | undefined): string | null {
  return properties === undefined ? null : JSON.stringify(properties)
}

function appendText(appender: FactAppender, value: string | null): void {
  if (value === null || value === undefined) {
    appender.appendNull()

    return
  }

  appender.appendVarchar(value)
}

function appendNumber(appender: FactAppender, value: number | null): void {
  if (value === null || value === undefined) {
    appender.appendNull()

    return
  }

  appender.appendDouble(value)
}

function appendNullableBoolean(appender: FactAppender, value: number | null): void {
  if (value === null || value === undefined) {
    appender.appendNull()

    return
  }

  appender.appendBoolean(Boolean(value))
}

function appendBoolean(appender: FactAppender, value: boolean): void {
  appender.appendBoolean(value)
}

function appendTimestamp(appender: FactAppender, value: number | null): void {
  if (value === null || value === undefined) {
    appender.appendNull()

    return
  }

  appender.appendTimestamp(new DuckDBTimestampValue(BigInt(value) * 1000n))
}
