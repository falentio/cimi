import { describe, expect, it } from 'vitest'
import {
  cohortFilterDimensionKey,
  cohortFilterDraftToFilter,
  compareCohortFilters,
  decodeCohortFilters,
  describeCohortFilter,
  encodeCohortFilters,
  hasCohortFilterValue,
  isCohortValueOperator,
  normalizeCohortFilters,
  removeCohortFilterValue,
  replaceCohortFilterValue,
  toCohortReportFilters,
  toggleCohortFilterValue,
} from './cohort-filters'
import type {
  CohortFilterScope,
  CohortFilterValues,
  CohortReportFilter,
  CohortValueOperator,
} from './cohort-retention.types'

interface FilterOptions {
  readonly scope?: CohortFilterScope
  readonly field?: string
  readonly operator?: CohortValueOperator
  readonly values?: CohortFilterValues
}

function filter(options: FilterOptions = {}): CohortReportFilter {
  const built = cohortFilterDraftToFilter({
    scope: options.scope ?? 'event',
    field: options.field ?? 'pagePath',
    operator: options.operator ?? 'equals',
    values: options.values ?? ['/pricing'],
  })

  if (built === null) throw new Error('The filter fixture must be valid.')

  return built
}

describe('normalizeCohortFilters', () => {
  it('drops empty values and dedupes within a filter', () => {
    expect(
      normalizeCohortFilters([
        { scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing', '/pricing'] },
        { scope: 'event', field: 'referrer', operator: 'equals', values: [] },
      ]),
    ).toEqual([filter()])
  })

  it('merges values that share a dimension', () => {
    expect(normalizeCohortFilters([filter(), filter({ values: ['/docs'] })])).toEqual([
      filter({ values: ['/pricing', '/docs'] }),
    ])
  })

  it('caps the list at the contract bound', () => {
    const filters = normalizeCohortFilters(
      Array.from({ length: 25 }, (_unused, index) =>
        filter({ scope: 'profile', field: 'trait.field' + String(index) }),
      ),
    )

    expect(filters).toHaveLength(20)
  })
})

describe('compareCohortFilters', () => {
  it('reports equality on dimension and values', () => {
    expect(compareCohortFilters(filter(), filter())).toBe(true)
    expect(compareCohortFilters(filter(), filter({ operator: 'contains' }))).toBe(false)
    expect(compareCohortFilters(filter(), filter({ values: ['/docs'] }))).toBe(false)
  })

  it('ignores value order', () => {
    expect(
      compareCohortFilters(
        filter({ values: ['/pricing', '/docs'] }),
        filter({ values: ['/docs', '/pricing'] }),
      ),
    ).toBe(true)
  })
})

describe('hasCohortFilterValue', () => {
  it('finds a value the list already carries', () => {
    expect(hasCohortFilterValue([filter()], filter({ values: ['/pricing'] }))).toBe(true)
    expect(hasCohortFilterValue([filter()], filter({ values: ['/docs'] }))).toBe(false)
  })
})

describe('toggleCohortFilterValue', () => {
  it('adds a value that is absent', () => {
    expect(toggleCohortFilterValue([filter()], filter({ values: ['/docs'] }))).toEqual([
      filter({ values: ['/pricing', '/docs'] }),
    ])
  })

  it('removes a value that is present', () => {
    expect(toggleCohortFilterValue([filter({ values: ['/pricing', '/docs'] })], filter())).toEqual([
      filter({ values: ['/docs'] }),
    ])
  })

  it('removes the filter when its last value goes', () => {
    expect(toggleCohortFilterValue([filter()], filter())).toEqual([])
  })
})

describe('removeCohortFilterValue', () => {
  it('removes only the targeted value', () => {
    expect(
      removeCohortFilterValue(
        [filter({ values: ['/pricing', '/docs'] }), filter({ field: 'referrer' })],
        filter(),
      ),
    ).toEqual([filter({ values: ['/docs'] }), filter({ field: 'referrer' })])
  })
})

describe('replaceCohortFilterValue', () => {
  it('swaps the current filter for its replacement', () => {
    const replacement = filter({ field: 'referrer', values: ['example.com'] })

    expect(replaceCohortFilterValue([filter()], filter(), replacement)).toEqual([replacement])
  })
})

describe('cohortFilterDraftToFilter', () => {
  it('builds an event filter from a known dimension', () => {
    expect(
      cohortFilterDraftToFilter({
        scope: 'event',
        field: 'pagePath',
        operator: 'contains',
        values: ['pricing'],
      }),
    ).toEqual({ scope: 'event', field: 'pagePath', operator: 'contains', values: ['pricing'] })
  })

  it('builds a session filter from a known dimension', () => {
    expect(
      cohortFilterDraftToFilter({
        scope: 'session',
        field: 'country',
        operator: 'equals',
        values: ['DE'],
      }),
    ).toEqual({ scope: 'session', field: 'country', operator: 'equals', values: ['DE'] })
  })

  it('builds a profile filter for a well-formed trait field', () => {
    expect(
      cohortFilterDraftToFilter({
        scope: 'profile',
        field: 'trait.plan',
        operator: 'equals',
        values: ['pro'],
      }),
    ).toEqual({ scope: 'profile', field: 'trait.plan', operator: 'equals', values: ['pro'] })
  })

  it('rejects a profile field that breaks the trait pattern', () => {
    expect(
      cohortFilterDraftToFilter({
        scope: 'profile',
        field: 'identityKind',
        operator: 'equals',
        values: ['visitor'],
      }),
    ).toBeNull()
  })

  it('rejects an unknown field and an empty value', () => {
    expect(
      cohortFilterDraftToFilter({
        scope: 'event',
        field: 'nope',
        operator: 'equals',
        values: ['x'],
      }),
    ).toBeNull()
    expect(
      cohortFilterDraftToFilter({
        scope: 'event',
        field: 'pagePath',
        operator: 'equals',
        values: [],
      }),
    ).toBeNull()
  })
})

describe('toCohortReportFilters', () => {
  it('keeps only drafts the contract accepts', () => {
    expect(
      toCohortReportFilters([
        { scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] },
        { scope: 'profile', field: 'plan', operator: 'equals', values: ['pro'] },
      ]),
    ).toEqual([filter()])
  })
})

describe('isCohortValueOperator', () => {
  it('separates the value operators from the action operators', () => {
    expect(isCohortValueOperator('equals')).toBe(true)
    expect(isCohortValueOperator('greater_than')).toBe(true)
    expect(isCohortValueOperator('has_done')).toBe(false)
    expect(isCohortValueOperator('nonsense')).toBe(false)
  })
})

describe('cohortFilterDimensionKey', () => {
  it('joins the scope and field', () => {
    expect(cohortFilterDimensionKey({ scope: 'session', field: 'country' })).toBe('session.country')
  })
})

describe('describeCohortFilter', () => {
  it('renders a human-readable chip', () => {
    expect(describeCohortFilter(filter())).toBe('Page path is /pricing')
  })
})

describe('encodeCohortFilters', () => {
  it('round-trips through decodeCohortFilters', () => {
    const filters = [
      filter(),
      filter({ scope: 'session', field: 'country', values: ['DE'] }),
      filter({ scope: 'profile', field: 'trait.plan', values: ['pro'] }),
    ]

    expect(decodeCohortFilters(encodeCohortFilters(filters))).toEqual(
      normalizeCohortFilters(filters),
    )
  })

  it('returns an empty string for no filters', () => {
    expect(encodeCohortFilters([])).toBe('')
  })
})

describe('decodeCohortFilters', () => {
  it('returns nothing for a missing or blank param', () => {
    expect(decodeCohortFilters(undefined)).toEqual([])
    expect(decodeCohortFilters('')).toEqual([])
    expect(decodeCohortFilters('   ')).toEqual([])
  })

  it('returns nothing for unparseable input', () => {
    expect(decodeCohortFilters('%7Bnot-json')).toEqual([])
  })

  it('returns nothing for a non-array payload', () => {
    expect(decodeCohortFilters(encodeURIComponent(JSON.stringify({ scope: 'event' })))).toEqual([])
  })

  it('drops entries whose field is not in the picklists', () => {
    const raw = encodeURIComponent(
      JSON.stringify([
        { scope: 'event', field: 'nope', operator: 'equals', values: ['x'] },
        filter(),
      ]),
    )

    expect(decodeCohortFilters(raw)).toEqual([filter()])
  })

  it('drops entries whose operator is not a value operator', () => {
    const raw = encodeURIComponent(
      JSON.stringify([{ scope: 'visitor', operator: 'has_done', action: { kind: 'page_view' } }]),
    )

    expect(decodeCohortFilters(raw)).toEqual([])
  })

  it('drops entries with no usable value', () => {
    const raw = encodeURIComponent(
      JSON.stringify([{ scope: 'event', field: 'pagePath', operator: 'equals', values: [] }]),
    )

    expect(decodeCohortFilters(raw)).toEqual([])
  })
})
