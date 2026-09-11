import type { Db } from '@cimi/db'
import { isRecord } from '@cimi/utils'

export interface BackupIdentityBoundary {
  readonly siteId: string
  readonly identifiedUserId: string
  readonly epochStartedAt: number | null
  readonly epochEndedAt: number | null
}

export function scrubAcceptedEventIdentity(db: Db, input: BackupIdentityBoundary): void {
  db.$client
    .prepare(
      `UPDATE accepted_event
       SET identified_user_id = NULL
       WHERE site_id = ? AND identified_user_id = ?
         AND (? IS NULL OR receipt_time >= ?)
         AND (? IS NULL OR receipt_time < ?)`,
    )
    .run(
      input.siteId,
      input.identifiedUserId,
      input.epochStartedAt,
      input.epochStartedAt,
      input.epochEndedAt,
      input.epochEndedAt,
    )
}

export function scrubCanonicalEventPayloads(db: Db, input: BackupIdentityBoundary): void {
  const payloads = db.$client
    .prepare(
      `SELECT ep.event_pk AS eventPk, ep.canonical_payload_json AS payload,
              ae.identified_user_id AS acceptedIdentifiedUserId
       FROM event_payload ep
       JOIN accepted_event ae ON ae.event_pk = ep.event_pk
       WHERE ae.site_id = ?
         AND (? IS NULL OR ae.receipt_time >= ?)
         AND (? IS NULL OR ae.receipt_time < ?)`,
    )
    .all(
      input.siteId,
      input.epochStartedAt,
      input.epochStartedAt,
      input.epochEndedAt,
      input.epochEndedAt,
    ) as Array<{
    readonly eventPk: number
    readonly payload: string
    readonly acceptedIdentifiedUserId: string | null
  }>
  for (const payload of payloads) {
    let parsed: unknown
    try {
      parsed = JSON.parse(payload.payload)
    } catch {
      if (payload.acceptedIdentifiedUserId === input.identifiedUserId) {
        throw new Error('Backup event payload identity does not match accepted event')
      }
      continue
    }
    if (!isRecord(parsed)) {
      if (payload.acceptedIdentifiedUserId === input.identifiedUserId) {
        throw new Error('Backup event payload identity does not match accepted event')
      }
      continue
    }
    if (parsed['identifiedUserId'] === input.identifiedUserId) {
      db.$client
        .prepare('UPDATE event_payload SET canonical_payload_json = ? WHERE event_pk = ?')
        .run(JSON.stringify({ ...parsed, identifiedUserId: null }), payload.eventPk)
      continue
    }
    if (
      payload.acceptedIdentifiedUserId === input.identifiedUserId &&
      parsed['identifiedUserId'] !== null
    ) {
      throw new Error('Backup event payload identity does not match accepted event')
    }
  }
}
