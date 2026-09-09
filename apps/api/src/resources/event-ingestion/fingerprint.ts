import { createHash } from 'node:crypto'
import { canonicalJsonString } from '@cimi/utils'
import type { EventInput } from './repository.ts'

const FINGERPRINT_EXCLUDED_KEYS = new Set(['ingestionIdentifier'])

export function fingerprintEvent(event: EventInput): string {
  return createHash('sha256').update(canonicalEventJson(event)).digest('hex')
}

export function canonicalEventJson(value: unknown): string {
  return canonicalJsonString(value, { excludeKeys: FINGERPRINT_EXCLUDED_KEYS })
}
