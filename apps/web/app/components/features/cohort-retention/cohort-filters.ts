import * as v from 'valibot'
import { MAX_REPORT_FILTERS } from './cohort-report-query'
import type {
  CohortFilterFieldByScope,
  CohortFilterScope,
  CohortFilterValues,
  CohortReportFilter,
  CohortValueOperator,
} from './cohort-retention.types'

export type CohortFilterScopeWithoutProfile = Exclude<CohortFilterScope, 'profile'>

export interface CohortFilterOperatorOption {
  readonly value: CohortValueOperator
  readonly label: string
}

export type CohortFilterDimension =
  | {
      readonly scope: 'event'
      readonly field: CohortFilterFieldByScope['event']
      readonly label: string
    }
  | {
      readonly scope: 'session'
      readonly field: CohortFilterFieldByScope['session']
      readonly label: string
    }

export interface CohortFilterDraft {
  readonly scope: CohortFilterScope
  readonly field: string
  readonly operator: CohortValueOperator
  readonly values: CohortFilterValues
}

export const cohortFilterOperatorOptions: readonly CohortFilterOperatorOption[] = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'greater_than', label: 'is greater than' },
  { value: 'less_than', label: 'is less than' },
]

export const cohortFilterDimensions: readonly CohortFilterDimension[] = [
  { scope: 'event', field: 'kind', label: 'Event kind' },
  { scope: 'event', field: 'name', label: 'Event name' },
  { scope: 'event', field: 'pagePath', label: 'Page path' },
  { scope: 'event', field: 'referrer', label: 'Referrer' },
  { scope: 'event', field: 'destination', label: 'Destination' },
  { scope: 'event', field: 'unit', label: 'Metric unit' },
  { scope: 'event', field: 'code', label: 'Error code' },
  { scope: 'session', field: 'device', label: 'Device' },
  { scope: 'session', field: 'browser', label: 'Browser' },
  { scope: 'session', field: 'os', label: 'Operating system' },
  { scope: 'session', field: 'country', label: 'Country' },
  { scope: 'session', field: 'region', label: 'Region' },
  { scope: 'session', field: 'city', label: 'City' },
  { scope: 'session', field: 'entryPage', label: 'Entry page' },
  { scope: 'session', field: 'exitPage', label: 'Exit page' },
  { scope: 'session', field: 'utmSource', label: 'UTM source' },
  { scope: 'session', field: 'utmMedium', label: 'UTM medium' },
  { scope: 'session', field: 'utmCampaign', label: 'UTM campaign' },
]

const PROFILE_FIELD_PATTERN = /^trait\.[A-Za-z0-9_.-]{1,63}$/

const DecodedCohortFilterSchema = v.object({
  scope: v.picklist(['event', 'session', 'profile']),
  field: v.string(),
  operator: v.picklist(cohortFilterOperatorOptions.map((option) => option.value)),
  values: v.array(v.string()),
})

const DecodedCohortFiltersSchema = v.array(DecodedCohortFilterSchema)

export function isCohortValueOperator(value: string): value is CohortValueOperator {
  return cohortFilterOperatorOptions.some((option) => option.value === value)
}

export function cohortFilterDimensionKey(input: {
  readonly scope: string
  readonly field: string
}): string {
  return input.scope + '.' + input.field
}

export function cohortFilterOperatorLabel(operator: string): string {
  const option = cohortFilterOperatorOptions.find((candidate) => candidate.value === operator)

  return option === undefined ? operator : option.label
}

export function cohortFilterDimensionLabel(input: {
  readonly scope: string
  readonly field: string
}): string {
  const dimension = findCohortFilterDimension(input)

  return dimension === null ? input.scope + '.' + input.field : dimension.label
}

function findCohortFilterDimension(input: {
  readonly scope: string
  readonly field: string
}): CohortFilterDimension | null {
  const key = cohortFilterDimensionKey(input)

  const dimension = cohortFilterDimensions.find(
    (candidate) => cohortFilterDimensionKey(candidate) === key,
  )

  return dimension === undefined ? null : dimension
}

function sameDimension(left: CohortReportFilter, right: CohortReportFilter): boolean {
  return (
    left.scope === right.scope && left.field === right.field && left.operator === right.operator
  )
}

function uniqueValues(values: readonly string[]): CohortFilterValues | null {
  const unique = [...new Set(values)]

  return unique.length === 0 ? null : unique
}

function withValues(filter: CohortReportFilter, values: CohortFilterValues): CohortReportFilter {
  return { ...filter, values }
}

export function compareCohortFilters(left: CohortReportFilter, right: CohortReportFilter): boolean {
  if (!sameDimension(left, right)) return false

  const leftValues = uniqueValues(left.values)
  const rightValues = uniqueValues(right.values)

  if (leftValues === null || rightValues === null) return leftValues === rightValues

  return (
    leftValues.length === rightValues.length &&
    leftValues.every((value) => rightValues.includes(value))
  )
}

export function normalizeCohortFilters(
  filters: readonly CohortReportFilter[],
): readonly CohortReportFilter[] {
  const normalized: CohortReportFilter[] = []

  for (const filter of filters) {
    const values = uniqueValues(filter.values)

    if (values === null) continue

    const existing = normalized.find((candidate) => sameDimension(candidate, filter))

    if (existing === undefined) {
      normalized.push(withValues(filter, values))
      continue
    }

    const mergedValues = uniqueValues([...existing.values, ...values])

    if (mergedValues !== null) {
      normalized[normalized.indexOf(existing)] = withValues(existing, mergedValues)
    }
  }

  return normalized.slice(0, MAX_REPORT_FILTERS)
}

export function hasCohortFilterValue(
  filters: readonly CohortReportFilter[],
  target: CohortReportFilter,
): boolean {
  return filters.some(
    (filter) =>
      sameDimension(filter, target) && target.values.some((value) => filter.values.includes(value)),
  )
}

export function toggleCohortFilterValue(
  filters: readonly CohortReportFilter[],
  target: CohortReportFilter,
): readonly CohortReportFilter[] {
  const next = [...normalizeCohortFilters(filters)]

  for (const value of target.values) {
    const existing = next.find((filter) => sameDimension(filter, target))

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

export function removeCohortFilterValue(
  filters: readonly CohortReportFilter[],
  target: CohortReportFilter,
): readonly CohortReportFilter[] {
  const normalized = normalizeCohortFilters(filters)
  const remaining: CohortReportFilter[] = []

  for (const filter of normalized) {
    if (!sameDimension(filter, target)) {
      remaining.push(filter)
      continue
    }

    const remainingValues = uniqueValues(
      filter.values.filter((value) => !target.values.includes(value)),
    )

    if (remainingValues !== null) remaining.push(withValues(filter, remainingValues))
  }

  return remaining
}

export function replaceCohortFilterValue(
  filters: readonly CohortReportFilter[],
  current: CohortReportFilter,
  replacement: CohortReportFilter,
): readonly CohortReportFilter[] {
  return normalizeCohortFilters([...removeCohortFilterValue(filters, current), replacement])
}

export function cohortFilterDraftToFilter(draft: CohortFilterDraft): CohortReportFilter | null {
  const field = draft.field.trim()
  const values = uniqueValues(draft.values)

  if (field.length === 0 || values === null) return null

  if (draft.scope === 'profile') {
    if (!PROFILE_FIELD_PATTERN.test(field)) return null

    return { scope: 'profile', field, operator: draft.operator, values }
  }

  const dimension = findCohortFilterDimension({ scope: draft.scope, field })

  if (dimension === null) return null

  if (dimension.scope === 'event') {
    return { scope: 'event', field: dimension.field, operator: draft.operator, values }
  }

  return { scope: 'session', field: dimension.field, operator: draft.operator, values }
}

export function toCohortReportFilters(
  drafts: readonly CohortFilterDraft[],
): readonly CohortReportFilter[] {
  const filters: CohortReportFilter[] = []

  for (const draft of drafts) {
    const filter = cohortFilterDraftToFilter(draft)

    if (filter !== null) filters.push(filter)
  }

  return normalizeCohortFilters(filters)
}

export function describeCohortFilter(filter: CohortReportFilter): string {
  const label = cohortFilterDimensionLabel({ scope: filter.scope, field: filter.field })
  const operator = cohortFilterOperatorLabel(filter.operator)

  return label + ' ' + operator + ' ' + filter.values.join(', ')
}

export function encodeCohortFilters(filters: readonly CohortReportFilter[]): string {
  if (filters.length === 0) return ''

  return encodeURIComponent(JSON.stringify(filters))
}

export function decodeCohortFilters(raw: string | undefined): readonly CohortReportFilter[] {
  if (raw === undefined || raw.trim() === '') return []

  let payload: unknown

  try {
    payload = JSON.parse(decodeURIComponent(raw))
  } catch {
    return []
  }

  const parsed = v.safeParse(DecodedCohortFiltersSchema, payload)

  return parsed.success ? toCohortReportFilters(parsed.output) : []
}
