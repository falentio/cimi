import {
  formatLocalCalendarDate,
  parseLocalCalendarDate,
  type LocalCalendarDate,
} from '@cimi/utils'

export type SiteId = string & { readonly __siteId: unique symbol }
export type CalendarDate = string & { readonly __calendarDate: unique symbol }
export type InstantMs = number & { readonly __instantMs: unique symbol }

export type WeekStart =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type ReportGranularity = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
export type PeriodKey = 'current' | 'comparison'
export type CoverageDependency = 'event-occurrence' | 'profile-activity' | 'replay-receipt'

export interface InclusiveDateRange {
  readonly fromDate: CalendarDate
  readonly toDate: CalendarDate
}

export interface HalfOpenInterval {
  readonly start: InstantMs
  readonly endExclusive: InstantMs
}

export interface BucketDemand {
  readonly granularity: ReportGranularity
  readonly maxStarts: number
}

export interface BucketStart {
  readonly at: InstantMs
  readonly localLabel: string
  readonly offsetMinutes: number
}

export interface ResolvedPeriod {
  readonly key: PeriodKey
  readonly dates: InclusiveDateRange
  readonly interval: HalfOpenInterval
  readonly calendarDays: number
  readonly bucketStarts: readonly BucketStart[] | null
}

export interface ResolvedPeriods {
  readonly current: ResolvedPeriod
  readonly comparison: ResolvedPeriod | null
}

export interface ReportWorkDemand {
  readonly extraMetricCount: number
  readonly dimensionCount: number
  readonly filterCount: number
  readonly distinctCountOperations: number
  readonly bucketWork?: number
  readonly budget: number
}

export interface ReportAdmissionInput {
  readonly siteId: SiteId
  readonly current: InclusiveDateRange
  readonly comparison?: InclusiveDateRange
  readonly bucket?: BucketDemand
  readonly coverage: readonly CoverageDependency[]
  readonly work: ReportWorkDemand
}

export interface SiteReportingMetadata {
  readonly siteId: SiteId
  readonly reportingTimezone: string
  readonly weekStartsOn: WeekStart
}

export interface ProjectionGap {
  readonly id: string
  readonly occurrenceFrom: InstantMs | null
  readonly occurrenceTo: InstantMs | null
  readonly unbounded: boolean
}

export interface ProjectionCheckpoint {
  readonly projectedAcceptanceSequence: number
  readonly projectedFactCardinality: number | null
  readonly occurrenceCoveredFrom: InstantMs | null
  readonly occurrenceCoveredThrough: InstantMs | null
}

export interface ProjectionEvidence {
  readonly checkpoint: ProjectionCheckpoint
  readonly openGaps: readonly ProjectionGap[]
}

export type AlignedStatistics =
  | Readonly<{
      readonly state: 'aligned'
      readonly asOfAcceptanceSequence: number
      readonly factCardinality: number
    }>
  | Readonly<{
      readonly state: 'stale'
      readonly asOfAcceptanceSequence: number | null
      readonly factCardinality: number | null
    }>
  | Readonly<{
      readonly state: 'unknown'
      readonly asOfAcceptanceSequence: number | null
      readonly factCardinality: number | null
    }>

export type RetentionBoundary =
  | Readonly<{ readonly state: 'available'; readonly from: InstantMs }>
  | Readonly<{ readonly state: 'disabled' }>
  | Readonly<{ readonly state: 'unknown' }>

export interface RetentionCoverage {
  readonly eventOccurrence: RetentionBoundary
  readonly profileActivity: RetentionBoundary
  readonly replayReceipt: RetentionBoundary
}

export interface FreshnessEvidence {
  readonly status: 'current' | 'stale'
  readonly projectedAcceptanceSequence: number
  readonly occurrenceTimeCoverageThrough: InstantMs | null
}

export interface FactWorkEstimate {
  readonly units: number
  readonly budget: number
  readonly components: Readonly<{
    readonly baseFacts: number
    readonly extraMetrics: number
    readonly bucketWork: number
    readonly dimensions: number
    readonly filters: number
    readonly distinctCounts: number
  }>
}

export interface ReportAdmissionTicket {
  readonly periods: ResolvedPeriods
  readonly freshness: Readonly<{
    readonly current: FreshnessEvidence
    readonly comparison: FreshnessEvidence | null
  }>
  readonly factWork: FactWorkEstimate
}

export function createSiteId(value: string): SiteId {
  if (value.trim() === '') throw new RangeError('Site ID must not be empty')
  return value as SiteId
}

export function createCalendarDate(value: string): CalendarDate {
  parseLocalCalendarDate(value)
  return value as CalendarDate
}

export function createInstantMs(value: number): InstantMs {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError('Instant must be a finite integer')
  }
  return value as InstantMs
}

export function instantFromDate(value: Date): InstantMs {
  return createInstantMs(value.getTime())
}

export function calendarDateParts(value: CalendarDate): LocalCalendarDate {
  return parseLocalCalendarDate(value)
}

export function calendarDateValue(value: LocalCalendarDate): CalendarDate {
  return createCalendarDate(formatLocalCalendarDate(value))
}
