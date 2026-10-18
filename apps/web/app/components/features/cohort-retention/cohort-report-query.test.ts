import { describe, expect, it } from 'vitest'
import type {
  CohortReportBlockedReason,
  CohortReportFilter,
  SCohort,
  SCohortReportInput,
} from './cohort-retention.types'
import type { CohortReportRequest } from './cohort-report-query'
import {
  MAX_REPORT_PERIODS,
  buildCohortComparison,
  clampCohortRange,
  countCohortPeriods,
  countReportPeriods,
  cohortReportRequestKey,
  defaultCohortRange,
  isCohortComparisonAllowed,
  isCurrentCohortRequest,
  parseCohortDate,
  resolveCohortReportRequest,
  shiftCohortPeriod,
} from './cohort-report-query'

function cohort(overrides: Partial<SCohort> = {}): SCohort {
  return {
    id: 'coh_1',
    siteId: 'ste_1',
    name: 'Trial to paid',
    entryAction: { kind: 'page_view' },
    retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
    identityKind: 'visitor',
    period: 'week',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

interface RequestInput {
  readonly siteId?: string | undefined
  readonly definition?: SCohort | undefined
  readonly range?: { readonly fromDate: string; readonly toDate: string } | undefined
  readonly comparison?: boolean
  readonly filters?: readonly CohortReportFilter[] | undefined
  readonly today?: () => string
}

function request(input: RequestInput): CohortReportRequest {
  return resolveCohortReportRequest({
    siteId: input.siteId,
    cohort: input.definition,
    selectionStatus: 'all',
    range: input.range,
    comparison: input.comparison ?? false,
    filters: input.filters ?? [],
    today: input.today,
  })
}

function expectInput(outcome: CohortReportRequest): SCohortReportInput {
  if (outcome.kind !== 'input') throw new Error('Expected an input request.')

  return outcome.input
}

function expectBlockedReason(outcome: CohortReportRequest): CohortReportBlockedReason {
  if (outcome.kind !== 'blocked') throw new Error('Expected a blocked request.')

  return outcome.reason
}

describe('countReportPeriods', () => {
  it('counts whole calendar days in an inclusive day range', () => {
    expect(
      countReportPeriods({ period: 'day', fromDate: '2026-01-01', toDate: '2026-01-12' }),
    ).toBe(12)
  })

  it('counts whole calendar months, aligning a mid-month start back to the first', () => {
    expect(
      countReportPeriods({ period: 'month', fromDate: '2026-01-31', toDate: '2026-03-01' }),
    ).toBe(3)
  })

  it('counts the buckets a mid-week range touches, not the days it spans', () => {
    expect(
      countReportPeriods({ period: 'week', fromDate: '2026-09-09', toDate: '2026-09-15' }),
    ).toBe(2)
  })

  it('counts zero for an inverted range', () => {
    expect(
      countReportPeriods({ period: 'day', fromDate: '2026-02-02', toDate: '2026-02-01' }),
    ).toBe(0)
  })

  it('counts one more bucket when the week starts on Sunday', () => {
    expect(
      countReportPeriods({ period: 'week', fromDate: '2026-09-07', toDate: '2026-09-13' }),
    ).toBe(1)
    expect(
      countReportPeriods({
        period: 'week',
        fromDate: '2026-09-07',
        toDate: '2026-09-13',
        weekStartsOn: 'sunday',
      }),
    ).toBe(2)
  })
})

describe('countCohortPeriods', () => {
  it('agrees with the shared primitive at every cadence', () => {
    const dayRange = { fromDate: '2026-01-01', toDate: '2026-01-13' }

    expect(countCohortPeriods('day', dayRange)).toBe(13)
    expect(countCohortPeriods('week', { fromDate: '2026-01-05', toDate: '2026-03-30' })).toBe(13)
    expect(countCohortPeriods('month', { fromDate: '2025-01-01', toDate: '2026-01-01' })).toBe(13)
  })
})

describe('resolveCohortReportRequest', () => {
  it('blocks an unresolved site instead of fetching', () => {
    const outcome = request({ siteId: undefined, definition: cohort() })

    expect(outcome).toEqual({ kind: 'blocked', reason: { kind: 'site-unresolved' } })
  })

  it('blocks an unselected cohort instead of fetching', () => {
    const outcome = request({ siteId: 'ste_1', definition: undefined })

    expect(outcome).toEqual({ kind: 'blocked', reason: { kind: 'cohort-unselected' } })
  })

  it('blocks an inverted range with the range it was given', () => {
    const range = { fromDate: '2026-02-02', toDate: '2026-02-01' }
    const outcome = request({ siteId: 'ste_1', definition: cohort(), range })

    expect(outcome).toEqual({ kind: 'blocked', reason: { kind: 'range-invalid', range } })
  })

  it('blocks a malformed range instead of throwing', () => {
    const range = { fromDate: '2026-13-01', toDate: '2026-13-02' }
    const outcome = request({ siteId: 'ste_1', definition: cohort(), range })

    expect(outcome).toEqual({ kind: 'blocked', reason: { kind: 'range-invalid', range } })
  })

  it('blocks a thirteenth day period and names the bound', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'day' }),
      range: { fromDate: '2026-01-01', toDate: '2026-01-13' },
    })

    expect(outcome).toEqual({
      kind: 'blocked',
      reason: { kind: 'range-over-periods', maxPeriods: MAX_REPORT_PERIODS },
    })
  })

  it('blocks a thirteenth week period and names the bound', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'week' }),
      range: { fromDate: '2026-01-05', toDate: '2026-03-30' },
    })

    expect(expectBlockedReason(outcome)).toEqual({ kind: 'range-over-periods', maxPeriods: 12 })
  })

  it('blocks a thirteenth month period and names the bound', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'month' }),
      range: { fromDate: '2025-01-01', toDate: '2026-01-01' },
    })

    expect(expectBlockedReason(outcome)).toEqual({ kind: 'range-over-periods', maxPeriods: 12 })
  })

  it('accepts twelve periods at every cadence', () => {
    expect(
      request({
        siteId: 'ste_1',
        definition: cohort({ period: 'day' }),
        range: { fromDate: '2026-01-01', toDate: '2026-01-12' },
      }),
    ).toEqual({
      kind: 'input',
      input: {
        cohortId: 'coh_1',
        fromDate: '2026-01-01',
        toDate: '2026-01-12',
      },
    })
  })

  it('attaches the preceding equal-length comparison only when the flag is set', () => {
    const range = { fromDate: '2026-01-01', toDate: '2026-01-12' }
    const enabled = request({ siteId: 'ste_1', definition: cohort(), range, comparison: true })
    const disabled = request({ siteId: 'ste_1', definition: cohort(), range, comparison: false })

    expect(expectInput(enabled)).toEqual({
      cohortId: 'coh_1',
      fromDate: '2026-01-01',
      toDate: '2026-01-12',
      comparison: { fromDate: '2025-12-20', toDate: '2025-12-31' },
    })
    expect(expectInput(disabled).comparison).toBeUndefined()
  })

  it('omits the filter field entirely when no filter is set', () => {
    const input = expectInput(
      request({
        siteId: 'ste_1',
        definition: cohort(),
        range: { fromDate: '2026-01-01', toDate: '2026-01-12' },
      }),
    )

    expect('filters' in input).toBe(false)
  })

  it('keeps an archived cohort reportable', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ status: 'archived' }),
      range: { fromDate: '2026-01-01', toDate: '2026-01-12' },
    })

    expect(outcome.kind).toBe('input')
  })

  it('defaults the range from the cadence when none is carried', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'month' }),
      today: () => '2026-07-01',
    })

    expect(expectInput(outcome)).toMatchObject({
      cohortId: 'coh_1',
      fromDate: '2025-08-01',
      toDate: '2026-07-01',
    })
  })
})

describe('shiftCohortPeriod', () => {
  it('shifts days, weeks, and months without drifting the day of month', () => {
    expect(shiftCohortPeriod('2026-03-31', 'month', 1)).toBe('2026-04-30')
    expect(shiftCohortPeriod('2026-03-31', 'month', -1)).toBe('2026-02-28')
    expect(shiftCohortPeriod('2026-03-31', 'week', -1)).toBe('2026-03-24')
    expect(shiftCohortPeriod('2026-03-01', 'day', 0)).toBe('2026-03-01')
  })

  it('clamps to the last day of the target month', () => {
    expect(shiftCohortPeriod('2026-01-31', 'month', 1)).toBe('2026-02-28')
  })
})

describe('defaultCohortRange', () => {
  it('spans twelve periods ending today', () => {
    expect(defaultCohortRange('day', '2026-07-01')).toEqual({
      fromDate: '2026-06-20',
      toDate: '2026-07-01',
    })
  })

  it('spans twelve weeks ending today', () => {
    expect(defaultCohortRange('week', '2026-07-01')).toEqual({
      fromDate: '2026-04-15',
      toDate: '2026-07-01',
    })
  })
})

describe('clampCohortRange', () => {
  it('keeps a range inside the bound', () => {
    expect(
      clampCohortRange({ fromDate: '2026-06-01', toDate: '2026-06-10' }, 'day', '2026-07-01'),
    ).toEqual({
      fromDate: '2026-06-01',
      toDate: '2026-06-10',
    })
  })

  it('replaces a range past the bound with the default', () => {
    expect(
      clampCohortRange({ fromDate: '2026-01-01', toDate: '2026-06-30' }, 'day', '2026-07-01'),
    ).toEqual(defaultCohortRange('day', '2026-07-01'))
  })

  it('pulls a future end date back to today', () => {
    expect(
      clampCohortRange({ fromDate: '2026-06-25', toDate: '2026-09-01' }, 'day', '2026-07-01'),
    ).toEqual({ fromDate: '2026-06-25', toDate: '2026-07-01' })
  })
})

describe('buildCohortComparison', () => {
  it('ends the day before the range starts and matches its length', () => {
    expect(buildCohortComparison({ fromDate: '2026-01-01', toDate: '2026-01-12' })).toEqual({
      fromDate: '2025-12-20',
      toDate: '2025-12-31',
    })
  })
})

describe('isCohortComparisonAllowed', () => {
  it('accepts the adjacent equal-length window', () => {
    const range = { fromDate: '2026-01-01', toDate: '2026-01-12' }

    expect(isCohortComparisonAllowed(range, buildCohortComparison(range))).toBe(true)
  })

  it('rejects a window that is not adjacent', () => {
    expect(
      isCohortComparisonAllowed(
        { fromDate: '2026-01-01', toDate: '2026-01-12' },
        { fromDate: '2025-12-01', toDate: '2025-12-12' },
      ),
    ).toBe(false)
  })
})

describe('cohortReportRequestKey', () => {
  it('separates inputs that differ only by comparison', () => {
    const range = { fromDate: '2026-01-01', toDate: '2026-01-12' }
    const plain = request({ siteId: 'ste_1', definition: cohort(), range })
    const compared = request({ siteId: 'ste_1', definition: cohort(), range, comparison: true })

    expect(cohortReportRequestKey(plain)).not.toBe(cohortReportRequestKey(compared))
  })

  it('separates inputs that differ only by filters', () => {
    const range = { fromDate: '2026-01-01', toDate: '2026-01-12' }
    const plain = request({ siteId: 'ste_1', definition: cohort(), range })

    const filtered = request({
      siteId: 'ste_1',
      definition: cohort(),
      range,
      filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] }],
    })

    expect(cohortReportRequestKey(plain)).not.toBe(cohortReportRequestKey(filtered))
  })

  it('gives every blocked reason its own key', () => {
    const keys = new Set([
      cohortReportRequestKey(request({ siteId: undefined, definition: cohort() })),
      cohortReportRequestKey(request({ siteId: 'ste_1', definition: undefined })),
      cohortReportRequestKey(
        request({
          siteId: 'ste_1',
          definition: cohort({ period: 'day' }),
          range: { fromDate: '2026-01-01', toDate: '2026-01-13' },
        }),
      ),
      cohortReportRequestKey(
        request({
          siteId: 'ste_1',
          definition: cohort(),
          range: { fromDate: '2026-02-02', toDate: '2026-02-01' },
        }),
      ),
    ])

    expect(keys.size).toBe(4)
  })
})

describe('isCurrentCohortRequest', () => {
  it('reports true when the range reaches today', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'day' }),
      range: { fromDate: '2026-06-25', toDate: '2026-07-01' },
    })

    expect(isCurrentCohortRequest(outcome, '2026-07-01')).toBe(true)
  })

  it('reports false when the range ends before today', () => {
    const outcome = request({
      siteId: 'ste_1',
      definition: cohort({ period: 'day' }),
      range: { fromDate: '2026-06-01', toDate: '2026-06-12' },
    })

    expect(isCurrentCohortRequest(outcome, '2026-07-01')).toBe(false)
  })

  it('reports false for a blocked request', () => {
    expect(
      isCurrentCohortRequest(request({ siteId: 'ste_1', definition: undefined }), '2026-07-01'),
    ).toBe(false)
  })
})

describe('parseCohortDate', () => {
  it('accepts a real calendar date and rejects an impossible one', () => {
    expect(parseCohortDate('2026-02-28')).toBe('2026-02-28')
    expect(parseCohortDate('2026-02-30')).toBeNull()
    expect(parseCohortDate('01/02/2026')).toBeNull()
  })
})
