import { mergeEventAttribution, parseEventAttribution } from '@cimi/utils'
import type { Db } from '../client.ts'
import { linkCoversEvent } from '../identity/coverage.ts'

export interface EventRow {
  eventPk: number
  siteId: string
  eventId: string
  eventKind: string
  occurrenceTime: number
  receiptTime: number
  late: number
  visitorId: string | null
  anonymousIdentityId: string | null
  identifiedUserId: string | null
  analyticsSessionId: string | null
  botPolicyOutcome: string
  policyRevisionId: string
  replaySequence: number
  payloadFingerprint: string
  projectionState: 'pending' | 'projected' | 'failed'
  projectedAt: number | null
  pagePath: string | null
  referrer: string | null
  name: string | null
  destination: string | null
  value: number | null
  unit: string | null
  code: string | null
  message: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  deviceType: string | null
  browserType: string | null
  operatingSystem: string | null
  country: string | null
  canonicalPayloadJson: string | null
}

export interface PropertyRow {
  eventPk: number
  propertyKey: string
  valueType: 'string' | 'number' | 'boolean' | 'null'
  stringValue: string | null
  numberValue: number | null
  booleanValue: number | null
}

export interface IdentityEpochRow {
  profileId: string
  siteId: string
  identifiedUserId: string
  profileEpoch: number
  profileStatus: string
  epochStatus: 'active' | 'redacted'
  startedAt: number
  endedAt: number | null
}

export interface IdentityLinkRow {
  siteId: string
  profileId: string
  profileEpoch: number
  anonymousIdentityId: string
  analyticsSessionId: string | null
  effectiveFrom: number
  unlinkedAt: number | null
}

export interface IdentityRedactionRow {
  siteId: string
  profileId: string
  identifiedUserId: string
  profileEpoch: number
  status: 'requested' | 'applying' | 'applied'
}

export interface Identities {
  epochs: IdentityEpochRow[]
  links: IdentityLinkRow[]
  redactions: IdentityRedactionRow[]
}

export interface GapRow {
  id: string
  siteId: string
  occurrenceFrom: number | null
  occurrenceTo: number | null
  unbounded: number
  status: string
  observedAt: number
  resolvedAt: number | null
}

export interface ProjectionEventScope {
  readonly siteId?: string
  readonly afterReplaySequence?: number
  readonly limit?: number
}

export type ProjectedEventRow = EventRow & { profileId: string | null }

const EVENT_SELECT = `SELECT
   ae.event_pk AS eventPk, ae.site_id AS siteId, ae.event_id AS eventId,
    ae.event_kind AS eventKind, ae.occurrence_time AS occurrenceTime,
    ae.receipt_time AS receiptTime, ae.late AS late, ae.visitor_id AS visitorId,
    ae.anonymous_identity_id AS anonymousIdentityId,
     ae.identified_user_id AS identifiedUserId, ae.analytics_session_id AS analyticsSessionId,
     ae.bot_policy_outcome AS botPolicyOutcome,
     ae.utm_source AS utmSource, ae.utm_medium AS utmMedium,
     ae.utm_campaign AS utmCampaign, ae.device_type AS deviceType,
     ae.browser AS browserType, ae.operating_system AS operatingSystem,
     ae.country AS country,
    ae.policy_revision_id AS policyRevisionId, ae.replay_sequence AS replaySequence,
    ae.payload_fingerprint AS payloadFingerprint, ae.projection_state AS projectionState,
    ae.projected_at AS projectedAt,
    epv.page_path AS pagePath, epv.referrer AS referrer,
    COALESCE(ec.name, eo.name, ep.name, ee.name) AS name,
    eo.destination AS destination, ep.value AS value, ep.unit AS unit,
    ee.code AS code, ee.message AS message,
    payload.canonical_payload_json AS canonicalPayloadJson
  FROM accepted_event ae
  JOIN site s ON s.id = ae.site_id AND s.status = 'active'
   LEFT JOIN event_page_view epv ON epv.event_pk = ae.event_pk
   LEFT JOIN event_payload payload ON payload.event_pk = ae.event_pk
 LEFT JOIN event_custom ec ON ec.event_pk = ae.event_pk
 LEFT JOIN event_outbound eo ON eo.event_pk = ae.event_pk
   LEFT JOIN event_performance ep ON ep.event_pk = ae.event_pk
   LEFT JOIN event_error ee ON ee.event_pk = ae.event_pk
   LEFT JOIN retention_effective_cutoff rc ON rc.site_id = ae.site_id
   WHERE (rc.site_id IS NULL OR ae.occurrence_time >= rc.event_occurrence_cutoff_at)
     AND NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = ae.site_id)`

const EVENT_SITE_CLAUSE = ' AND ae.site_id = ?'

const EVENT_AFTER_SEQUENCE_CLAUSE = ' AND ae.replay_sequence > ?'

const EVENT_ORDER_CLAUSE = ' ORDER BY ae.replay_sequence'

const EVENT_LIMIT_CLAUSE = ' LIMIT ?'

export function readEvents(db: Db, scope?: ProjectionEventScope): EventRow[] {
  let sql = EVENT_SELECT
  const args: (string | number)[] = []

  if (scope?.siteId !== undefined) {
    sql += EVENT_SITE_CLAUSE
    args.push(scope.siteId)
  }

  if (scope?.afterReplaySequence !== undefined) {
    sql += EVENT_AFTER_SEQUENCE_CLAUSE
    args.push(scope.afterReplaySequence)
  }

  sql += EVENT_ORDER_CLAUSE

  if (scope?.limit !== undefined) {
    sql += EVENT_LIMIT_CLAUSE
    args.push(scope.limit)
  }

  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  const rows = db.$client.prepare(sql).all(...args) as EventRow[]

  return rows.map((row) => {
    const attribution = mergeEventAttribution(
      {
        utmSource: row.utmSource,
        utmMedium: row.utmMedium,
        utmCampaign: row.utmCampaign,
        deviceType: row.deviceType,
        browser: row.browserType,
        os: row.operatingSystem,
        country: row.country,
      },
      parseEventAttribution(row.canonicalPayloadJson),
    )

    return {
      ...row,
      utmSource: attribution.utmSource,
      utmMedium: attribution.utmMedium,
      utmCampaign: attribution.utmCampaign,
      deviceType: attribution.deviceType,
      browserType: attribution.browser,
      operatingSystem: attribution.os,
      country: attribution.country,
    }
  })
}

export function readProperties(db: Db, eventPks: readonly number[]): PropertyRow[] {
  if (eventPks.length === 0) return []

  const placeholders = eventPks.map(() => '?').join(', ')

  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  return db.$client
    .prepare(
      `SELECT
         event_pk AS eventPk, property_key AS propertyKey, value_type AS valueType,
         string_value AS stringValue, number_value AS numberValue, boolean_value AS booleanValue
       FROM event_property
       WHERE event_pk IN (${placeholders})
       ORDER BY event_pk, property_key`,
    )
    .all(...eventPks) as PropertyRow[]
}

export function readIdentities(db: Db): Identities {
  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  const epochs = db.$client
    .prepare(
      `SELECT
         e.profile_id AS profileId, e.site_id AS siteId, e.identified_user_id AS identifiedUserId,
         e.epoch AS profileEpoch, p.status AS profileStatus, e.status AS epochStatus,
         e.started_at AS startedAt, e.ended_at AS endedAt
        FROM identity_profile_epoch e
        JOIN identity_profile p ON p.profile_id = e.profile_id
        JOIN site s ON s.id = e.site_id AND s.status = 'active'
        WHERE NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = e.site_id)
        ORDER BY e.site_id, e.identified_user_id, e.epoch`,
    )
    .all() as IdentityEpochRow[]

  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  const links = db.$client
    .prepare(
      `SELECT
         site_id AS siteId, profile_id AS profileId, profile_epoch AS profileEpoch,
         anonymous_identity_id AS anonymousIdentityId, analytics_session_id AS analyticsSessionId,
         effective_from AS effectiveFrom, unlinked_at AS unlinkedAt
       FROM identity_link
       ORDER BY site_id, anonymous_identity_id, effective_from, id`,
    )
    .all() as IdentityLinkRow[]

  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  const redactions = db.$client
    .prepare(
      `SELECT
         site_id AS siteId, profile_id AS profileId, identified_user_id AS identifiedUserId,
         profile_epoch AS profileEpoch, status
       FROM identity_redaction
       ORDER BY site_id, identified_user_id, profile_epoch, id`,
    )
    .all() as IdentityRedactionRow[]

  return { epochs, links, redactions }
}

export function readActiveSiteIds(db: Db): string[] {
  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  return (
    db.$client
      .prepare(
        `SELECT s.id AS siteId
         FROM site s
         WHERE s.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM site_tombstone st WHERE st.site_id = s.id)
         ORDER BY s.id`,
      )
      .all() as { siteId: string }[]
  ).map((row) => row.siteId)
}

export function readProjectionGaps(db: Db): GapRow[] {
  // SAFETY: raw SQL via drizzle returns untyped rows; shape fixed by the static SELECT above.
  return db.$client
    .prepare(
      `SELECT
         id, site_id AS siteId, occurrence_from AS occurrenceFrom,
         occurrence_to AS occurrenceTo, unbounded, status, observed_at AS observedAt,
         resolved_at AS resolvedAt
       FROM projection_gap
       ORDER BY id`,
    )
    .all() as GapRow[]
}

export function projectEventIdentity(event: EventRow, identities: Identities): ProjectedEventRow {
  const links = identities.links.filter((link) =>
    linkCoversEvent(
      {
        siteId: link.siteId,
        profileId: link.profileId,
        profileEpoch: link.profileEpoch,
        anonymousIdentityId: link.anonymousIdentityId,
        analyticsSessionId: link.analyticsSessionId,
        effectiveFromMs: link.effectiveFrom,
        unlinkedAtMs: link.unlinkedAt,
      },
      {
        siteId: event.siteId,
        anonymousIdentityId: event.anonymousIdentityId,
        analyticsSessionId: event.analyticsSessionId,
        receiptTimeMs: event.receiptTime,
      },
    ),
  )

  const linkedEpochs = identities.epochs.filter(
    (epoch) =>
      links.some(
        (link) => link.profileId === epoch.profileId && link.profileEpoch === epoch.profileEpoch,
      ) &&
      (event.identifiedUserId === null || epoch.identifiedUserId === event.identifiedUserId),
  )

  if (links.length > 0 && linkedEpochs.length === 0) {
    throw new Error('Identity link references a missing or mismatched Profile Epoch')
  }

  const temporalEpochs = identities.epochs.filter(
    (epoch) =>
      epoch.siteId === event.siteId &&
      event.identifiedUserId !== null &&
      epoch.identifiedUserId === event.identifiedUserId &&
      epoch.startedAt <= event.occurrenceTime &&
      (epoch.endedAt === null || event.occurrenceTime < epoch.endedAt),
  )

  const candidates = linkedEpochs.length > 0 ? linkedEpochs : temporalEpochs

  if (candidates.length > 1) throw new Error('Ambiguous identity Profile Epoch')
  const epoch = candidates[0]

  const redacted = identities.redactions.some(
    (redaction) =>
      redaction.siteId === event.siteId &&
      (epoch !== undefined
        ? redaction.profileId === epoch.profileId && redaction.profileEpoch === epoch.profileEpoch
        : event.identifiedUserId !== null && redaction.identifiedUserId === event.identifiedUserId),
  )

  if (
    redacted ||
    epoch?.epochStatus === 'redacted' ||
    (epoch !== undefined && epoch.profileStatus !== 'active')
  ) {
    return { ...event, identifiedUserId: null, profileId: null }
  }

  if (epoch === undefined) return { ...event, profileId: null }

  return { ...event, identifiedUserId: epoch.identifiedUserId, profileId: epoch.profileId }
}

export function propertyValue(property: PropertyRow): string | number | boolean | null {
  if (property.valueType === 'string') return property.stringValue

  if (property.valueType === 'number') return property.numberValue

  if (property.valueType === 'boolean') return property.booleanValue !== 0

  return null
}
