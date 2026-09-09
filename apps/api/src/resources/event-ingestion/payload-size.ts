import { isRecord } from '@cimi/utils'

const LONG_TEXT_KEYS = new Set(['pagePath', 'referrer', 'destination'])
const IDE_KEYS = new Set(['eventId', 'ingestionIdentifier'])

export function isParsedPayloadOversized(value: unknown): boolean {
  if (!isRecord(value)) return false
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'properties' && isRecord(entry)) {
      if (Object.keys(entry).length > 64) return true
      if (Object.keys(entry).some((propertyKey) => propertyKey.length > 64)) return true
      if (
        Object.values(entry).some(
          (propertyValue) => typeof propertyValue === 'string' && propertyValue.length > 512,
        )
      )
        return true
      continue
    }
    if (typeof entry !== 'string') continue
    if (IDE_KEYS.has(key)) continue
    if (LONG_TEXT_KEYS.has(key)) {
      if (entry.length > 2048) return true
      continue
    }
    if (entry.length > 512) return true
  }
  return false
}
