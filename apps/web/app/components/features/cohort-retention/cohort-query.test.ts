import { describe, expect, it } from 'vitest'
import { encodeCohortFilters } from './cohort-filters'
import {
  MAX_REPORT_PERIODS,
  cohortQueryFromRoute,
  cohortRouteParams,
  diffCohortRouteParams,
  type CohortRouteParamInput,
} from './cohort-query'
import type { CohortQueryState } from './cohort-retention.types'

function query(overrides: Partial<CohortQueryState> = {}): CohortQueryState {
  return {
    siteId: 'ste_1',
    selection: { cohortId: 'coh_1', status: 'all' },
    range: undefined,
    comparison: false,
    filters: [],
    ...overrides,
  }
}

function route(overrides: Partial<CohortRouteParamInput> = {}): CohortRouteParamInput {
  return {
    siteIdParam: undefined,
    cohortParam: undefined,
    statusParam: undefined,
    fromParam: undefined,
    toParam: undefined,
    compareParam: undefined,
    filtersParam: undefined,
    ...overrides,
  }
}

function currentParams(state: CohortQueryState) {
  return {
    cohort: undefined,
    status: undefined,
    from: undefined,
    to: undefined,
    compare: undefined,
    filters: undefined,
    ...cohortRouteParams(state),
  }
}

describe('cohortQueryFromRoute', () => {
  it('decodes a full param bag', () => {
    const filters = encodeCohortFilters([
      { scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] },
    ])

    expect(
      cohortQueryFromRoute(
        route({
          siteIdParam: 'ste_1',
          cohortParam: 'coh_1',
          statusParam: 'archived',
          fromParam: '2026-01-01',
          toParam: '2026-01-12',
          compareParam: '1',
          filtersParam: filters,
        }),
      ),
    ).toEqual({
      siteId: 'ste_1',
      selection: { cohortId: 'coh_1', status: 'archived' },
      range: { fromDate: '2026-01-01', toDate: '2026-01-12' },
      comparison: true,
      filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] }],
    })
  })

  it('falls back to an all-status selection and no comparison when absent', () => {
    expect(cohortQueryFromRoute(route({ siteIdParam: 'ste_1' }))).toEqual(
      query({ selection: { cohortId: undefined, status: 'all' } }),
    )
  })

  it('falls back to the default status when the param is unknown', () => {
    expect(cohortQueryFromRoute(route({ statusParam: 'pending' })).selection.status).toBe('all')
  })

  it('drops a range whose dates are not calendar dates', () => {
    expect(
      cohortQueryFromRoute(route({ fromParam: '2026-02-30', toParam: '2026-03-01' })).range,
    ).toBeUndefined()
  })

  it('drops an inverted range', () => {
    expect(
      cohortQueryFromRoute(route({ fromParam: '2026-03-02', toParam: '2026-03-01' })).range,
    ).toBeUndefined()
  })

  it('reads the first value of an array param', () => {
    expect(
      cohortQueryFromRoute(route({ cohortParam: ['coh_1', 'coh_2'] })).selection.cohortId,
    ).toBe('coh_1')
  })

  it('treats a blank cohort param as no selection', () => {
    expect(cohortQueryFromRoute(route({ cohortParam: '' })).selection.cohortId).toBeUndefined()
  })
})

describe('cohortRouteParams', () => {
  it('returns an empty bag for a default state', () => {
    expect(cohortRouteParams(query({ selection: { cohortId: undefined, status: 'all' } }))).toEqual(
      {},
    )
  })

  it('omits a field already at its default', () => {
    expect(cohortRouteParams(query({ selection: { cohortId: 'coh_1', status: 'all' } }))).toEqual({
      cohort: 'coh_1',
    })
  })

  it('encodes range, comparison, filters, and a non-default status', () => {
    const filters: readonly {
      scope: 'event'
      field: 'pagePath'
      operator: 'equals'
      values: string[]
    }[] = [{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] }]

    expect(
      cohortRouteParams(
        query({
          selection: { cohortId: 'coh_1', status: 'archived' },
          range: { fromDate: '2026-01-01', toDate: '2026-01-12' },
          comparison: true,
          filters,
        }),
      ),
    ).toEqual({
      cohort: 'coh_1',
      status: 'archived',
      from: '2026-01-01',
      to: '2026-01-12',
      compare: '1',
      filters: encodeCohortFilters(filters),
    })
  })
})

describe('diffCohortRouteParams', () => {
  it('reports no change when the route already carries the state', () => {
    const state = query({ range: { fromDate: '2026-01-01', toDate: '2026-01-12' } })

    expect(diffCohortRouteParams(currentParams(state), state)).toEqual({
      params: {},
      changed: false,
    })
  })

  it('reports only the fields that moved', () => {
    const state = query({ range: { fromDate: '2026-01-01', toDate: '2026-01-12' } })

    expect(diffCohortRouteParams(currentParams(query()), state)).toEqual({
      params: { from: '2026-01-01', to: '2026-01-12' },
      changed: true,
    })
  })

  it('clears a field that returns to its default', () => {
    expect(diffCohortRouteParams(currentParams(query({ comparison: true })), query())).toEqual({
      params: { compare: undefined },
      changed: true,
    })
  })
})

describe('MAX_REPORT_PERIODS', () => {
  it('is the twelve-period bound', () => {
    expect(MAX_REPORT_PERIODS).toBe(12)
  })
})
