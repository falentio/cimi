import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { and, eq, lt, max } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import { mergeEventAttribution, parseEventAttribution, type EventAttribution } from '@cimi/utils'
import type { AcceptanceCandidate, AcceptanceRepository, AppendOutcome } from './repository.ts'
import type { DerivedAttribution } from './attribution.ts'

export interface AcceptanceRepositoryDrizzleDependencies {
  readonly db: Db
}

export class AcceptanceRepositoryDrizzle implements AcceptanceRepository {
  private readonly db: Db

  constructor({ db }: AcceptanceRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findByEventId(
    siteId: string,
    eventId: string,
  ): Promise<{ readonly receiptTime: string; readonly payloadFingerprint: string } | undefined> {
    const row = await this.db
      .select({
        receiptTime: schema.TAcceptedEvent.receiptTime,
        payloadFingerprint: schema.TAcceptedEvent.payloadFingerprint,
      })
      .from(schema.TAcceptedEvent)
      .where(
        and(eq(schema.TAcceptedEvent.siteId, siteId), eq(schema.TAcceptedEvent.eventId, eventId)),
      )
      .limit(1)
    const event = row[0]
    return event === undefined
      ? undefined
      : {
          receiptTime: event.receiptTime.toISOString(),
          payloadFingerprint: event.payloadFingerprint,
        }
  }

  async lastReplaySequence(): Promise<number> {
    const row = await this.db
      .select({ sequence: max(schema.TEventAcceptanceJournal.replaySequence) })
      .from(schema.TEventAcceptanceJournal)
    return row[0]?.sequence ?? 0
  }

  async findIdentitySession(input: {
    readonly siteId: string
    readonly anonymousIdentityId: string | null
    readonly identifiedUserId: string | null
  }) {
    if (input.anonymousIdentityId === null && input.identifiedUserId === null) return undefined
    const identityClause =
      input.anonymousIdentityId === null
        ? 'ae.anonymous_identity_id IS NULL AND ae.identified_user_id = ?'
        : 'ae.anonymous_identity_id = ?'
    const identityValue = input.anonymousIdentityId ?? input.identifiedUserId
    const latest = this.db.$client
      .prepare(
        `SELECT
           ae.visitor_id AS visitorId,
           ae.analytics_session_id AS analyticsSessionId,
           ae.receipt_time AS receiptTime,
           ae.identified_user_id AS identifiedUserId
         FROM accepted_event ae
         WHERE ae.site_id = ?
           AND ae.visitor_id IS NOT NULL
           AND ae.analytics_session_id IS NOT NULL
           AND ${identityClause}
         ORDER BY ae.receipt_time DESC, ae.event_pk DESC
         LIMIT 1`,
      )
      .get(input.siteId, identityValue) as IdentitySessionRow | undefined
    if (latest === undefined) return undefined

    const first = this.db.$client
      .prepare(
        `SELECT ae.receipt_time AS receiptTime, ep.canonical_payload_json AS payload,
                ae.utm_source AS utmSource, ae.utm_medium AS utmMedium,
                ae.utm_campaign AS utmCampaign, ae.device_type AS deviceType,
                ae.browser AS browser, ae.operating_system AS os, ae.country AS country
         FROM accepted_event ae
         LEFT JOIN event_payload ep ON ep.event_pk = ae.event_pk
         WHERE ae.site_id = ? AND ae.analytics_session_id = ?
         ORDER BY ae.receipt_time ASC, ae.event_pk ASC
         LIMIT 1`,
      )
      .get(input.siteId, latest.analyticsSessionId) as
      | ({ readonly receiptTime: number; readonly payload: string | null } & AttributionRow)
      | undefined
    return {
      visitorId: latest.visitorId,
      analyticsSessionId: latest.analyticsSessionId,
      receiptTime: new Date(latest.receiptTime).toISOString(),
      sessionStartTime: new Date(first?.receiptTime ?? latest.receiptTime).toISOString(),
      attribution: readAttribution(first?.payload, first),
    }
  }

  async findByPageViewId(
    siteId: string,
    pageViewId: string,
  ): Promise<{ readonly receiptTime: string; readonly payloadFingerprint: string } | undefined> {
    const row = this.db.$client
      .prepare(
        `SELECT receipt_time AS receiptTime, payload_fingerprint AS payloadFingerprint
         FROM accepted_event
         WHERE site_id = ? AND page_view_id = ?
         LIMIT 1`,
      )
      .get(siteId, pageViewId) as
      | { readonly receiptTime: number; readonly payloadFingerprint: string }
      | undefined
    return row === undefined
      ? undefined
      : {
          receiptTime: new Date(row.receiptTime).toISOString(),
          payloadFingerprint: row.payloadFingerprint,
        }
  }

  walBytes(): number {
    try {
      return statSync(`${this.db.$client.name}-wal`).size
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return 0
    }
  }

  async append(candidates: readonly AcceptanceCandidate[]): Promise<readonly AppendOutcome[]> {
    const flushId = randomUUID()
    const outcomes = this.db.transaction((tx) =>
      candidates.map((candidate) => appendCandidate(tx, candidate, flushId)),
    )
    return outcomes
  }

  async deleteExpired(input: {
    readonly siteId: string
    readonly receiptCutoff: Date
  }): Promise<number> {
    const rows = this.db
      .delete(schema.TAcceptedEvent)
      .where(
        and(
          eq(schema.TAcceptedEvent.siteId, input.siteId),
          lt(schema.TAcceptedEvent.receiptTime, input.receiptCutoff),
        ),
      )
      .returning({ eventPk: schema.TAcceptedEvent.eventPk })
      .all()
    return rows.length
  }

  async deleteExpiredReplayMaterial(input: {
    readonly siteId: string
    readonly receiptCutoff: Date
  }): Promise<number> {
    const rows = this.db.$client
      .prepare(
        `DELETE FROM event_payload
         WHERE event_pk IN (
           SELECT event_pk FROM accepted_event
           WHERE site_id = ? AND receipt_time < ?
         )
         RETURNING event_pk`,
      )
      .all(input.siteId, input.receiptCutoff.getTime())
    return rows.length
  }
}

interface IdentitySessionRow {
  readonly visitorId: string
  readonly analyticsSessionId: string
  readonly receiptTime: number
}

type AttributionRow = EventAttribution

function readAttribution(
  payload: string | null | undefined,
  stored?: AttributionRow,
): DerivedAttribution {
  return mergeEventAttribution(stored, parseEventAttribution(payload))
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

function appendCandidate(
  tx: SqliteTransaction,
  candidate: AcceptanceCandidate,
  flushId: string,
): AppendOutcome {
  const event = candidate.event
  const receiptTime = new Date(candidate.receiptTime)
  const occurrenceTime = new Date(event.occurrenceTime)
  const existing = tx
    .select({
      receiptTime: schema.TAcceptedEvent.receiptTime,
      payloadFingerprint: schema.TAcceptedEvent.payloadFingerprint,
    })
    .from(schema.TAcceptedEvent)
    .where(
      and(
        eq(schema.TAcceptedEvent.siteId, candidate.siteId),
        eq(schema.TAcceptedEvent.eventId, event.eventId),
      ),
    )
    .limit(1)
    .all()[0]
  if (existing !== undefined) {
    return existing.payloadFingerprint === candidate.payloadFingerprint
      ? { status: 'duplicate', receiptTime: existing.receiptTime.toISOString() }
      : { status: 'conflict' }
  }

  if (event.kind === 'page_view') {
    const existingPageView = tx
      .select({
        receiptTime: schema.TAcceptedEvent.receiptTime,
        payloadFingerprint: schema.TAcceptedEvent.payloadFingerprint,
      })
      .from(schema.TAcceptedEvent)
      .where(
        and(
          eq(schema.TAcceptedEvent.siteId, candidate.siteId),
          eq(schema.TAcceptedEvent.pageViewId, event.pageViewId),
        ),
      )
      .limit(1)
      .all()[0]
    if (existingPageView !== undefined) {
      return existingPageView.payloadFingerprint === candidate.payloadFingerprint
        ? { status: 'duplicate', receiptTime: existingPageView.receiptTime.toISOString() }
        : { status: 'conflict' }
    }
  }

  const inserted = tx
    .insert(schema.TAcceptedEvent)
    .values({
      siteId: candidate.siteId,
      eventId: event.eventId,
      eventKind: event.kind,
      anonymousIdentityId: event.anonymousIdentityId,
      pageViewId: event.kind === 'page_view' ? event.pageViewId : null,
      occurrenceTime,
      receiptTime,
      late: candidate.late,
      visitorId: candidate.visitorId,
      identifiedUserId: event.identifiedUserId,
      analyticsSessionId: candidate.analyticsSessionId,
      botPolicyOutcome: event.botPolicyOutcome,
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      deviceType: event.deviceType,
      browser: event.browser,
      operatingSystem: event.os,
      country: event.country,
      policyRevisionId: candidate.policyRevisionId,
      replaySequence: candidate.replaySequence,
      payloadFingerprint: candidate.payloadFingerprint,
      projectionState: 'pending',
      projectedAt: null,
      createdAt: receiptTime,
    })
    .returning({ eventPk: schema.TAcceptedEvent.eventPk })
    .all()[0]
  if (inserted === undefined) throw new Error('Accepted Event insert returned no row')

  tx.insert(schema.TEventPayload)
    .values({ eventPk: inserted.eventPk, canonicalPayloadJson: JSON.stringify(event) })
    .run()
  appendKind(tx, inserted.eventPk, event)
  appendProperties(tx, inserted.eventPk, event.properties)
  tx.insert(schema.TEventAcceptanceJournal)
    .values({
      eventPk: inserted.eventPk,
      replaySequence: candidate.replaySequence,
      payloadFingerprint: candidate.payloadFingerprint,
      receiptTime,
      policyRevisionId: candidate.policyRevisionId,
      acceptanceState: 'accepted',
      projectionState: 'pending',
      committedAt: receiptTime,
      flushId,
    })
    .run()
  return { status: 'accepted' }
}

function appendKind(
  tx: SqliteTransaction,
  eventPk: number,
  event: AcceptanceCandidate['event'],
): void {
  switch (event.kind) {
    case 'page_view':
      tx.insert(schema.TEventPageView)
        .values({ eventPk, pagePath: event.pagePath ?? '/', referrer: event.referrer })
        .run()
      return
    case 'custom_event':
      tx.insert(schema.TEventCustom).values({ eventPk, name: event.name }).run()
      return
    case 'outbound':
      tx.insert(schema.TEventOutbound)
        .values({ eventPk, destination: event.destination, name: event.name })
        .run()
      return
    case 'performance':
      tx.insert(schema.TEventPerformance)
        .values({ eventPk, name: event.name, value: event.value, unit: event.unit })
        .run()
      return
    case 'error':
      tx.insert(schema.TEventError)
        .values({ eventPk, name: event.name, code: event.code, message: event.message })
        .run()
      return
    default: {
      const exhaustive: never = event
      void exhaustive
      throw new Error('Unknown Event kind')
    }
  }
}

function appendProperties(
  tx: SqliteTransaction,
  eventPk: number,
  properties: Readonly<Record<string, string | number | boolean | null>>,
): void {
  for (const [propertyKey, value] of Object.entries(properties)) {
    const typed =
      value === null
        ? { valueType: 'null' as const, stringValue: null, numberValue: null, booleanValue: null }
        : typeof value === 'string'
          ? {
              valueType: 'string' as const,
              stringValue: value,
              numberValue: null,
              booleanValue: null,
            }
          : typeof value === 'number'
            ? {
                valueType: 'number' as const,
                stringValue: null,
                numberValue: value,
                booleanValue: null,
              }
            : {
                valueType: 'boolean' as const,
                stringValue: null,
                numberValue: null,
                booleanValue: value,
              }
    tx.insert(schema.TEventProperty)
      .values({ eventPk, propertyKey, ...typed })
      .run()
  }
}
