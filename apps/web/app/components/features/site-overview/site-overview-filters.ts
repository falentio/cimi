import type {
  OverviewEventFilterField,
  OverviewFilter,
  OverviewFilterOperator,
  OverviewFilterValues,
  OverviewSessionFilterField,
} from './site-overview.types'

export interface OverviewFilterOperatorOption {
  readonly value: OverviewFilterOperator
  readonly label: string
}

export type OverviewFilterDefinition =
  | {
      readonly scope: 'event'
      readonly field: OverviewEventFilterField
      readonly label: string
      readonly operators: readonly OverviewFilterOperatorOption[]
    }
  | {
      readonly scope: 'session'
      readonly field: OverviewSessionFilterField
      readonly label: string
      readonly operators: readonly OverviewFilterOperatorOption[]
    }

export const overviewFilterOperatorOptions: readonly OverviewFilterOperatorOption[] = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
]

export const overviewFilterDefinitions: readonly OverviewFilterDefinition[] = [
  {
    scope: 'event',
    field: 'pagePath',
    label: 'Page path',
    operators: overviewFilterOperatorOptions,
  },
  {
    scope: 'event',
    field: 'referrer',
    label: 'Referrer',
    operators: overviewFilterOperatorOptions,
  },
  {
    scope: 'session',
    field: 'country',
    label: 'Country',
    operators: overviewFilterOperatorOptions,
  },
  {
    scope: 'session',
    field: 'region',
    label: 'Region',
    operators: overviewFilterOperatorOptions,
  },
  {
    scope: 'session',
    field: 'device',
    label: 'Device',
    operators: overviewFilterOperatorOptions,
  },
  {
    scope: 'session',
    field: 'browser',
    label: 'Browser',
    operators: overviewFilterOperatorOptions,
  },
]

function sameFilterDimension(left: OverviewFilter, right: OverviewFilter): boolean {
  return (
    left.scope === right.scope && left.field === right.field && left.operator === right.operator
  )
}

function uniqueValues(values: readonly string[]): OverviewFilterValues | null {
  const unique = [...new Set(values)]
  const first = unique.at(0)
  return first === undefined ? null : [first, ...unique.slice(1)]
}

function withValues(filter: OverviewFilter, values: OverviewFilterValues): OverviewFilter {
  return { ...filter, values }
}

export function compareOverviewFilters(left: OverviewFilter, right: OverviewFilter): boolean {
  if (!sameFilterDimension(left, right)) return false

  const leftValues = uniqueValues(left.values)
  const rightValues = uniqueValues(right.values)
  if (leftValues === null || rightValues === null) return leftValues === rightValues
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value) => rightValues.includes(value))
  )
}

export function normalizeOverviewFilters(
  filters: readonly OverviewFilter[],
): readonly OverviewFilter[] {
  const normalized: OverviewFilter[] = []

  for (const filter of filters) {
    const values = uniqueValues(filter.values)
    if (values === null) continue

    const existing = normalized.find((candidate) => sameFilterDimension(candidate, filter))
    if (existing === undefined) {
      normalized.push(withValues(filter, values))
      continue
    }

    const mergedValues = uniqueValues([...existing.values, ...values])
    if (mergedValues !== null) {
      normalized[normalized.indexOf(existing)] = withValues(existing, mergedValues)
    }
  }

  return normalized
}

export function hasOverviewFilterValue(
  filters: readonly OverviewFilter[],
  target: OverviewFilter,
): boolean {
  return filters.some(
    (filter) =>
      sameFilterDimension(filter, target) &&
      target.values.some((value) => filter.values.includes(value)),
  )
}

export function toggleOverviewFilterValue(
  filters: readonly OverviewFilter[],
  target: OverviewFilter,
): readonly OverviewFilter[] {
  const next = [...normalizeOverviewFilters(filters)]

  for (const value of target.values) {
    const existing = next.find((filter) => sameFilterDimension(filter, target))
    if (existing === undefined) {
      next.push(withValues(target, [value]))
      continue
    }

    const index = next.indexOf(existing)
    if (existing.values.includes(value)) {
      const remainingValues = uniqueValues(
        existing.values.filter((candidate) => candidate !== value),
      )
      if (remainingValues === null) {
        next.splice(index, 1)
      } else {
        next[index] = withValues(existing, remainingValues)
      }
      continue
    }

    const mergedValues = uniqueValues([...existing.values, value])
    if (mergedValues !== null) next[index] = withValues(existing, mergedValues)
  }

  return next
}

export function removeOverviewFilterValue(
  filters: readonly OverviewFilter[],
  target: OverviewFilter,
): readonly OverviewFilter[] {
  const normalized = normalizeOverviewFilters(filters)
  return normalized.flatMap((filter) => {
    if (!sameFilterDimension(filter, target)) return [filter]

    const remainingValues = uniqueValues(
      filter.values.filter((value) => !target.values.includes(value)),
    )
    return remainingValues === null ? [] : [withValues(filter, remainingValues)]
  })
}

export function replaceOverviewFilterValue(
  filters: readonly OverviewFilter[],
  current: OverviewFilter,
  replacement: OverviewFilter,
): readonly OverviewFilter[] {
  return normalizeOverviewFilters([...removeOverviewFilterValue(filters, current), replacement])
}
