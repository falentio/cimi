import type {
  CohortFreshnessLabel,
  CohortReportBlockedReason,
  CohortReportRow,
  CohortReportViewModel,
  SCohort,
  SCohortIdentityKind,
  SCohortPeriodCadence,
  SCohortReportOutput,
  SCohortReportPeriod,
} from './cohort-retention.types'

export const COHORT_LIST_PAGE_SIZE = 20

const IDENTITY_LABELS: Readonly<Record<SCohortIdentityKind, string>> = {
  visitor: 'Visitors',
  identified_user: 'Identified users',
}

const PERIOD_LABELS: Readonly<Record<SCohortPeriodCadence, string>> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
}

const FRESHNESS_LABELS: Readonly<Record<'current' | 'stale', string>> = {
  current: 'Current',
  stale: 'Stale',
}

const BLOCKED_HINTS: Readonly<Record<CohortReportBlockedReason['kind'], string>> = {
  'range-over-periods':
    'This range covers more periods than the report returns. Shorten it to twelve periods or fewer.',
  'range-invalid':
    'This range is not a valid reporting window. Pick an end date on or after the start date.',
  'site-unresolved': 'This site is not resolved. Choose a site from the workspace switcher.',
  'cohort-unselected': 'Choose a cohort to read its retention report.',
  'filters-invalid':
    'A filter on this report is not supported. Remove it and read the report again.',
}

export function toCohortReportViewModel(input: {
  report: SCohortReportOutput
  cohort: Pick<SCohort, 'name' | 'identityKind' | 'period'>
  locale: string
}): CohortReportViewModel {
  const { report, cohort } = input
  const comparisonPeriods = report.comparison?.periods ?? []

  const rows = report.periods.map((period) =>
    toCohortReportRow(
      period,
      comparisonPeriods.find((candidate) => candidate.index === period.index),
      input.locale,
    ),
  )

  const entry = rows.at(0)
  const latest = rows.at(-1)

  return {
    heading: cohort.name,
    identityLabel: IDENTITY_LABELS[cohort.identityKind],
    periodLabel: PERIOD_LABELS[cohort.period],
    statusLabel: cohortRetentionStatusLabel({ report }).label,
    statusTone: report.freshness.status,
    rows,
    totals: {
      size: entry === undefined ? 0 : entry.size,
      retained: latest === undefined ? 0 : latest.retained,
      rateLabel: latest === undefined ? '0%' : latest.rateLabel,
    },
    isCurrent: report.freshness.status === 'current',
    comparisonLabel: formatComparisonWindow(report, input.locale),
    coverageThroughLabel:
      report.freshness.occurrenceTimeCoverageThrough === null
        ? null
        : formatInstant(report.freshness.occurrenceTimeCoverageThrough, input.locale),
  }
}

export function cohortRetentionStatusLabel(input: {
  report: SCohortReportOutput
}): CohortFreshnessLabel {
  const status = input.report.freshness.status

  return { label: FRESHNESS_LABELS[status], tone: status }
}

export function cohortDeficiencyHint(reason: CohortReportBlockedReason): string {
  return BLOCKED_HINTS[reason.kind]
}

function toCohortReportRow(
  period: SCohortReportPeriod,
  comparison: SCohortReportPeriod | undefined,
  locale: string,
): CohortReportRow {
  const comparisonRate = comparison === undefined ? null : comparison.rate

  return {
    index: period.index,
    fromDate: period.fromDate,
    toDate: period.toDate,
    size: period.size,
    retained: period.retained,
    rate: period.rate,
    rateLabel: formatRate(period.rate, locale),
    comparisonRate,
    comparisonRateLabel: comparisonRate === null ? null : formatRate(comparisonRate, locale),
    deltaLabel: comparisonRate === null ? null : formatDelta(period.rate - comparisonRate, locale),
    deltaKind: comparisonRate === null ? 'neutral' : deltaKind(period.rate - comparisonRate),
  }
}

function deltaKind(delta: number): 'positive' | 'negative' | 'neutral' {
  if (delta > 0) return 'positive'

  if (delta < 0) return 'negative'

  return 'neutral'
}

function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(rate)
}

function formatDelta(delta: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(delta)
}

function formatComparisonWindow(report: SCohortReportOutput, locale: string): string | null {
  const window = report.comparison

  if (window === undefined || window === null) return null

  return (
    formatCalendarDate(window.fromDate, locale) + ' to ' + formatCalendarDate(window.toDate, locale)
  )
}

function formatCalendarDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(value + 'T00:00:00Z'),
  )
}

function formatInstant(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  )
}
