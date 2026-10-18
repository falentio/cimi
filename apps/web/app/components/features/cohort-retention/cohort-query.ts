import { decodeCohortFilters, encodeCohortFilters } from './cohort-filters'
import { MAX_REPORT_PERIODS, parseCohortDate } from './cohort-report-query'
import type {
  CohortDateRange,
  CohortQueryState,
  CohortSelectionStatus,
} from './cohort-retention.types'

export { MAX_REPORT_PERIODS }

export interface CohortRouteParamInput {
  readonly siteIdParam: string | readonly string[] | undefined
  readonly cohortParam: string | readonly string[] | undefined
  readonly statusParam: string | readonly string[] | undefined
  readonly fromParam: string | readonly string[] | undefined
  readonly toParam: string | readonly string[] | undefined
  readonly compareParam: string | readonly string[] | undefined
  readonly filtersParam: string | readonly string[] | undefined
}

export interface CohortRouteParams {
  readonly cohort?: string
  readonly status?: string
  readonly from?: string
  readonly to?: string
  readonly compare?: string
  readonly filters?: string
}

export interface CohortRouteParamDiff {
  readonly params: Record<string, string | undefined>
  readonly changed: boolean
}

const SELECTION_STATUSES: readonly CohortSelectionStatus[] = ['active', 'archived', 'all']

const TRUTHY_COMPARE_VALUES: ReadonlySet<string> = new Set(['1', 'true', 'on'])

export function cohortQueryFromRoute(input: CohortRouteParamInput): CohortQueryState {
  const status = parseSelectionStatus(input.statusParam)
  const from = parseCohortDate(firstParam(input.fromParam)) ?? undefined
  const to = parseCohortDate(firstParam(input.toParam)) ?? undefined
  const range = resolveRange(from, to)

  return {
    siteId: firstParam(input.siteIdParam),
    selection: {
      cohortId: firstParam(input.cohortParam),
      status: status ?? 'all',
    },
    range,
    comparison: TRUTHY_COMPARE_VALUES.has(firstParam(input.compareParam) ?? ''),
    filters: decodeCohortFilters(firstParam(input.filtersParam)),
  }
}

/**
 * Encodes the state as route params, omitting every field already at its
 * default. An empty result means the state carries nothing worth writing to the
 * URL; diffCohortRouteParams decides whether a navigation is warranted.
 */
export function cohortRouteParams(state: CohortQueryState): CohortRouteParams {
  const params: Record<string, string> = {}

  if (state.selection.cohortId !== undefined && state.selection.cohortId !== '') {
    params.cohort = state.selection.cohortId
  }

  if (state.selection.status !== 'all') params.status = state.selection.status

  if (state.range !== undefined) {
    params.from = state.range.fromDate
    params.to = state.range.toDate
  }

  if (state.comparison) params.compare = '1'

  const filters = encodeCohortFilters(state.filters)

  if (filters !== '') params.filters = filters

  return params
}

/** Structural comparison of the current params against the next state, with no cloning. */
export function diffCohortRouteParams(
  current: {
    readonly cohort: string | undefined
    readonly status: string | undefined
    readonly from: string | undefined
    readonly to: string | undefined
    readonly compare: string | undefined
    readonly filters: string | undefined
  },
  next: CohortQueryState,
): CohortRouteParamDiff {
  const encoded = cohortRouteParams(next)
  const params: Record<string, string | undefined> = {}
  let changed = false

  for (const key of ['cohort', 'status', 'from', 'to', 'compare', 'filters'] as const) {
    const currentValue = current[key]
    const nextValue = encoded[key]

    if (currentValue === nextValue) continue

    params[key] = nextValue
    changed = true
  }

  return { params, changed }
}

function resolveRange(
  from: string | undefined,
  to: string | undefined,
): CohortDateRange | undefined {
  if (from === undefined || to === undefined || from > to) return undefined

  return { fromDate: from, toDate: to }
}

function parseSelectionStatus(
  value: string | readonly string[] | undefined,
): CohortSelectionStatus | undefined {
  const raw = firstParam(value)

  return SELECTION_STATUSES.find((candidate) => candidate === raw)
}

function firstParam(value: string | readonly string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value

  return raw === undefined || raw === '' ? undefined : raw
}
