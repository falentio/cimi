import { createHash } from 'node:crypto'
import type { EventInput } from './repository.ts'

export function fingerprintEvent(event: EventInput): string {
  return createHash('sha256').update(canonicalEventJson(event)).digest('hex')
}

export function canonicalEventJson(value: unknown): string {
  return JSON.stringify(sortRecord(value))
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'ingestionIdentifier')
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortRecord(entry)]),
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
