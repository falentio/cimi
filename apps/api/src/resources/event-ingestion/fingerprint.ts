import { createHash } from 'node:crypto'
import { canonicalJsonString } from '@cimi/utils'
import type { EventInput } from './repository.ts'

const FINGERPRINT_EXCLUDED_KEYS = new Set(['ingestionIdentifier'])
const PAGE_VIEW_FINGERPRINT_EXCLUDED_KEYS = new Set(['ingestionIdentifier', 'eventId'])

export function fingerprintEvent(event: EventInput): string {
  return createHash('sha256').update(canonicalEventJson(event)).digest('hex')
}

export function fingerprintAcceptedEvent(event: EventInput): string {
  const excludedKeys =
    event.kind === 'page_view' ? PAGE_VIEW_FINGERPRINT_EXCLUDED_KEYS : FINGERPRINT_EXCLUDED_KEYS
  return createHash('sha256')
    .update(canonicalJsonString(event, { excludeKeys: excludedKeys }))
    .digest('hex')
}

export function canonicalEventJson(value: unknown): string {
  return canonicalJsonString(value, { excludeKeys: FINGERPRINT_EXCLUDED_KEYS })
}
