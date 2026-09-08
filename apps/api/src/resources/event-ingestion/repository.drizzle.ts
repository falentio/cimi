import { and, eq, lt, max } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { AcceptanceCandidate, AcceptanceRepository } from './repository.ts'

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

  walBytes(): number {
    const pageSize = this.db.$client.pragma('page_size', { simple: true })
    const checkpoint = this.db.$client.pragma('wal_checkpoint(PASSIVE)')
    const logPages = walCheckpointLogPages(checkpoint)
    if (logPages === undefined || typeof pageSize !== 'number') return 0
    return logPages * pageSize
  }

  async append(candidates: readonly AcceptanceCandidate[]): Promise<void> {
    this.db.transaction((tx) => {
      for (const candidate of candidates) appendCandidate(tx, candidate)
    })
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
}

function walCheckpointLogPages(value: unknown): number | undefined {
  const row = Array.isArray(value) ? value[0] : value
  if (
    typeof row !== 'object' ||
    row === null ||
    !('log' in row) ||
    typeof row.log !== 'number' ||
    !Number.isFinite(row.log)
  )
    return undefined
  return row.log
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

function appendCandidate(tx: SqliteTransaction, candidate: AcceptanceCandidate): void {
  const event = candidate.event
  const receiptTime = new Date(candidate.receiptTime)
  const occurrenceTime = new Date(event.occurrenceTime)
  const inserted = tx
    .insert(schema.TAcceptedEvent)
    .values({
      siteId: candidate.siteId,
      eventId: event.eventId,
      eventKind: event.kind,
      occurrenceTime,
      receiptTime,
      late: candidate.late,
      visitorId: candidate.visitorId,
      identifiedUserId: event.identifiedUserId,
      analyticsSessionId: candidate.analyticsSessionId,
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
      flushId: null,
    })
    .run()
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
