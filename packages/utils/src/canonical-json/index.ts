export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface SortedRecordOptions {
  readonly excludeKeys?: ReadonlySet<string> | undefined
}

export function sortedRecord(value: unknown, options: SortedRecordOptions = {}): unknown {
  if (Array.isArray(value)) return value.map((entry) => sortedRecord(entry, options))
  if (!isRecord(value)) return value
  const { excludeKeys } = options
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => excludeKeys === undefined || !excludeKeys.has(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, sortedRecord(entry, options)]),
  )
}

export function canonicalJsonString(value: unknown, options: SortedRecordOptions = {}): string {
  return JSON.stringify(sortedRecord(value, options))
}
