import { describe, expect, it } from 'vitest'
import {
  compareOverviewFilters,
  normalizeOverviewFilters,
  removeOverviewFilterValue,
  replaceOverviewFilterValue,
  toggleOverviewFilterValue,
} from './site-overview-filters'
import type { OverviewFilter } from './site-overview.types'

const pageFilter: OverviewFilter = {
  scope: 'event',
  field: 'pagePath',
  operator: 'equals',
  values: ['/'],
}

const pricingFilter: OverviewFilter = {
  scope: 'event',
  field: 'pagePath',
  operator: 'equals',
  values: ['/pricing'],
}

describe('site overview filters', () => {
  it('compares filter values without treating their order as meaningful', () => {
    expect(
      compareOverviewFilters(
        { ...pageFilter, values: ['/', '/pricing'] },
        { ...pageFilter, values: ['/pricing', '/'] },
      ),
    ).toBe(true)
    expect(compareOverviewFilters(pageFilter, { ...pageFilter, field: 'referrer' })).toBe(false)
  })

  it('merges repeated dimensions and removes duplicate values', () => {
    expect(
      normalizeOverviewFilters([pageFilter, { ...pricingFilter, values: ['/pricing', '/'] }]),
    ).toEqual([{ ...pageFilter, values: ['/', '/pricing'] }])
  })

  it('keeps different operators as separate AND filters', () => {
    const containsFilter: OverviewFilter = { ...pageFilter, operator: 'contains' }

    expect(normalizeOverviewFilters([pageFilter, containsFilter])).toEqual([
      pageFilter,
      containsFilter,
    ])
    expect(removeOverviewFilterValue([pageFilter, containsFilter], pageFilter)).toEqual([
      containsFilter,
    ])
  })

  it('toggles a value and removes the predicate after its last value', () => {
    expect(toggleOverviewFilterValue([], pageFilter)).toEqual([pageFilter])
    expect(toggleOverviewFilterValue([pageFilter], pricingFilter)).toEqual([
      { ...pageFilter, values: ['/', '/pricing'] },
    ])
    expect(toggleOverviewFilterValue([pageFilter], pageFilter)).toEqual([])
  })

  it('removes only the requested value and drops empty predicates', () => {
    const filters: readonly OverviewFilter[] = [{ ...pageFilter, values: ['/', '/pricing'] }]
    expect(removeOverviewFilterValue(filters, pricingFilter)).toEqual([pageFilter])
    expect(removeOverviewFilterValue(filters, pageFilter)).toEqual([
      { ...pageFilter, values: ['/pricing'] },
    ])
    expect(
      removeOverviewFilterValue(filters, { ...pageFilter, values: ['/', '/pricing'] }),
    ).toEqual([])
  })

  it('replaces a value and normalizes a replacement dimension', () => {
    expect(replaceOverviewFilterValue([pageFilter], pageFilter, pricingFilter)).toEqual([
      pricingFilter,
    ])
    expect(
      replaceOverviewFilterValue(
        [
          pageFilter,
          { scope: 'session', field: 'country', operator: 'equals', values: ['Germany'] },
        ],
        pageFilter,
        { scope: 'session', field: 'country', operator: 'equals', values: ['United States'] },
      ),
    ).toEqual([
      {
        scope: 'session',
        field: 'country',
        operator: 'equals',
        values: ['Germany', 'United States'],
      },
    ])
  })
})
