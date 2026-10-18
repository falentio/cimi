import { describe, expect, it } from 'vitest'
import {
  COHORT_LIST_PAGE_SIZE,
  cohortDeficiencyHint,
  cohortRetentionStatusLabel,
  toCohortReportViewModel,
} from './cohort-report-view'
import type { SCohort, SCohortReportOutput, SCohortReportPeriod } from './cohort-retention.types'

function period(overrides: Partial<SCohortReportPeriod> = {}): SCohortReportPeriod {
  return {
    index: 0,
    fromDate: '2026-06-01',
    toDate: '2026-06-07',
    size: 100,
    retained: 40,
    rate: 0.4,
    ...overrides,
  }
}

function report(overrides: Partial<SCohortReportOutput> = {}): SCohortReportOutput {
  return {
    fromDate: '2026-06-01',
    toDate: '2026-06-14',
    projectedAcceptanceSequence: 7,
    occurrenceTimeCoverageThrough: '2026-06-14T23:59:59Z',
    status: 'current',
    periods: [
      period({ index: 0 }),
      period({
        index: 1,
        fromDate: '2026-06-08',
        toDate: '2026-06-14',
        size: 40,
        retained: 0,
        rate: 0,
      }),
    ],
    comparison: null,
    ...overrides,
  }
}

function definition(
  overrides: Partial<SCohort> = {},
): Pick<SCohort, 'name' | 'identityKind' | 'period'> {
  return {
    name: 'Trial to paid',
    identityKind: 'visitor',
    period: 'week',
    ...overrides,
  }
}

describe('toCohortReportViewModel', () => {
  it('emits a row with retained 0 and a 0% label for a zero-retention period', () => {
    const view = toCohortReportViewModel({ report: report(), cohort: definition(), locale: 'en' })

    expect(view.rows[1]).toMatchObject({ retained: 0, rate: 0, rateLabel: '0%' })
  })

  it('maps every period one-to-one and never drops a row', () => {
    const view = toCohortReportViewModel({ report: report(), cohort: definition(), locale: 'en' })

    expect(view.rows.map((row) => row.index)).toEqual([0, 1])
  })

  it('labels the identity population and cadence', () => {
    const view = toCohortReportViewModel({
      report: report(),
      cohort: definition({ identityKind: 'identified_user', period: 'month' }),
      locale: 'en',
    })

    expect(view.identityLabel).toBe('Identified users')
    expect(view.periodLabel).toBe('Monthly')
  })

  it('reports the entry size and the latest retained count', () => {
    const view = toCohortReportViewModel({ report: report(), cohort: definition(), locale: 'en' })

    expect(view.totals).toEqual({ size: 100, retained: 0, rateLabel: '0%' })
  })

  it('renders a comparison delta per row', () => {
    const view = toCohortReportViewModel({
      report: report({
        comparison: {
          fromDate: '2026-05-19',
          toDate: '2026-06-01',
          projectedAcceptanceSequence: 5,
          occurrenceTimeCoverageThrough: '2026-06-01T23:59:59Z',
          status: 'current',
          periods: [
            period({
              index: 0,
              fromDate: '2026-05-19',
              toDate: '2026-05-25',
              size: 90,
              retained: 30,
              rate: 0.3333,
            }),
            period({
              index: 1,
              fromDate: '2026-05-26',
              toDate: '2026-06-01',
              size: 30,
              retained: 5,
              rate: 0.1667,
            }),
          ],
        },
      }),
      cohort: definition(),
      locale: 'en',
    })

    expect(view.rows[0]).toMatchObject({ comparisonRate: 0.3333, deltaKind: 'positive' })
    expect(view.rows[1]).toMatchObject({ comparisonRate: 0.1667, deltaKind: 'negative' })
    expect(view.comparisonLabel).not.toBeNull()
  })

  it('marks a stale report and keeps its rows', () => {
    const view = toCohortReportViewModel({
      report: report({
        projectedAcceptanceSequence: null,
        occurrenceTimeCoverageThrough: null,
        status: 'stale',
      }),
      cohort: definition(),
      locale: 'en',
    })

    expect(view.statusTone).toBe('stale')
    expect(view.statusLabel).toBe('Stale')
    expect(view.isCurrent).toBe(false)
    expect(view.rows).toHaveLength(2)
  })
})

describe('cohortRetentionStatusLabel', () => {
  it('labels the report freshness', () => {
    expect(cohortRetentionStatusLabel({ report: report() }).label).toBe('Current')
  })
})

describe('cohortDeficiencyHint', () => {
  it('names the bound for an over-long range', () => {
    expect(cohortDeficiencyHint({ kind: 'range-over-periods', maxPeriods: 12 })).toContain('twelve')
  })

  it('gives every blocked reason its own copy', () => {
    const hints = [
      cohortDeficiencyHint({ kind: 'range-over-periods', maxPeriods: 12 }),
      cohortDeficiencyHint({
        kind: 'range-invalid',
        range: { fromDate: '2026-01-01', toDate: '2026-01-01' },
      }),
      cohortDeficiencyHint({ kind: 'site-unresolved' }),
      cohortDeficiencyHint({ kind: 'cohort-unselected' }),
      cohortDeficiencyHint({ kind: 'filters-invalid', filters: [] }),
    ]

    expect(new Set(hints).size).toBe(5)
  })
})

describe('COHORT_LIST_PAGE_SIZE', () => {
  it('is the list page size', () => {
    expect(COHORT_LIST_PAGE_SIZE).toBe(20)
  })
})
