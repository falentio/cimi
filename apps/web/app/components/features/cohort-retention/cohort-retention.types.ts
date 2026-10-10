import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'

type CohortRetentionProcedures = CimiOrpc['cohortRetention']

type ListCohortsCall = CohortRetentionProcedures['listCohorts']['call']

type GetRetentionReportCall = CohortRetentionProcedures['getRetentionReport']['call']

type CreateCohortCall = CohortRetentionProcedures['createCohort']['call']

type UpdateCohortCall = CohortRetentionProcedures['updateCohort']['call']

type ArchiveCohortCall = CohortRetentionProcedures['archiveCohort']['call']

export type SCohort = Awaited<ReturnType<CohortRetentionProcedures['getCohort']['call']>>

export type SCohortAction = SCohort['entryAction']

export type SCohortPeriodCadence = SCohort['period']

export type SCohortStatus = SCohort['status']

export type SCohortIdentityKind = SCohort['identityKind']

export type SCohortReportInput = Parameters<
  CohortRetentionProcedures['getRetentionReport']['call']
>[0]

/**
 * The contract flattens SReportFreshness into the report through
 * valibot's entriesFromObjects, so the freshness fields sit on the report
 * itself rather than under a nested key. Taking the contract's own inferred
 * output means a contract change breaks this build instead of drifting.
 */
export type SCohortReportOutput = Awaited<
  ReturnType<CohortRetentionProcedures['getRetentionReport']['call']>
>

export type SCohortReportPeriod = SCohortReportOutput['periods'][number]

export type SCohortCreateInput = Parameters<CohortRetentionProcedures['createCohort']['call']>[0]

export type SCohortIdentityFields = Parameters<
  CohortRetentionProcedures['archiveCohort']['call']
>[0]

export type SCohortUpdateInput = Parameters<CohortRetentionProcedures['updateCohort']['call']>[0]

export type CohortDefinitionsPage = Awaited<
  ReturnType<CohortRetentionProcedures['listCohorts']['call']>
>

export interface CohortRetentionClient {
  readonly cohortRetention: {
    readonly listCohorts: { readonly call: ListCohortsCall }
    readonly getRetentionReport: { readonly call: GetRetentionReportCall }
    readonly createCohort: { readonly call: CreateCohortCall }
    readonly updateCohort: { readonly call: UpdateCohortCall }
    readonly archiveCohort: { readonly call: ArchiveCohortCall }
  }
}

export interface CohortOption {
  readonly cohortId: string
  readonly name: string
  readonly status: SCohortStatus
}

export interface CohortsOptions {
  readonly siteId: MaybeRefOrGetter<string | undefined>
  readonly today?: () => string
  readonly client?: CohortRetentionClient | undefined
  readonly routeQuery?: (() => CohortRouteQuery) | undefined
}

export type CohortReportFailure =
  | { readonly kind: 'authentication'; readonly message: string; readonly action: 'sign-in' }
  | { readonly kind: 'forbidden'; readonly message: string; readonly action: 'contact-admin' }
  | { readonly kind: 'not-found'; readonly message: string; readonly action: 'refresh' }
  | { readonly kind: 'query-limit'; readonly message: string; readonly action: 'adjust-range' }
  | { readonly kind: 'service-unavailable'; readonly message: string; readonly action: 'retry' }
  | { readonly kind: 'conflict'; readonly message: string; readonly action: 'refresh' }
  | { readonly kind: 'invalid-request'; readonly message: string; readonly action: 'adjust-range' }

export type CohortDefinitionsLoadState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'refreshing'; readonly definitions: readonly SCohort[] }
  | { readonly status: 'ready'; readonly definitions: readonly SCohort[] }
  | {
      readonly status: 'stale-error'
      readonly definitions: readonly SCohort[]
      readonly failure: CohortReportFailure
    }
  | { readonly status: 'error'; readonly failure: CohortReportFailure }

export type CohortReportBlockedReason =
  | { readonly kind: 'range-over-periods'; readonly maxPeriods: number }
  | { readonly kind: 'range-invalid'; readonly range: CohortDateRange }
  | { readonly kind: 'site-unresolved' }
  | { readonly kind: 'cohort-unselected' }
  | { readonly kind: 'filters-invalid'; readonly filters: readonly CohortReportFilter[] }

export type CohortReportOutcome =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly report: SCohortReportOutput; readonly current: boolean }
  | { readonly kind: 'blocked'; readonly reason: CohortReportBlockedReason }
  | { readonly kind: 'error'; readonly failure: CohortReportFailure }
  | { readonly kind: 'empty'; readonly reason: 'no-selection' | 'site-unresolved' }

export type CohortsState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'report-ready' }
  | { readonly status: 'report-blocked'; readonly reason: CohortReportBlockedReason }
  | { readonly status: 'report-error'; readonly failure: CohortReportFailure }
  | { readonly status: 'definitions-error'; readonly failure: CohortReportFailure }
  | { readonly status: 'report-current'; readonly report: SCohortReportOutput }
  | {
      readonly status: 'report-stale-error'
      readonly report: SCohortReportOutput
      readonly failure: CohortReportFailure
    }

export interface CohortReportRow {
  readonly index: number
  readonly fromDate: string
  readonly toDate: string
  readonly size: number
  readonly retained: number
  readonly rate: number
  readonly rateLabel: string
  readonly comparisonRate: number | null
  readonly comparisonRateLabel: string | null
  readonly deltaLabel: string | null
  readonly deltaKind: 'positive' | 'negative' | 'neutral'
}

export interface CohortReportTotals {
  readonly size: number
  readonly retained: number
  readonly rateLabel: string
}

export interface CohortReportViewModel {
  readonly heading: string
  readonly identityLabel: string
  readonly periodLabel: string
  readonly statusLabel: string
  readonly statusTone: 'current' | 'stale'
  readonly rows: readonly CohortReportRow[]
  readonly totals: CohortReportTotals
  readonly isCurrent: boolean
  readonly comparisonLabel: string | null
  readonly coverageThroughLabel: string | null
}

export interface CohortFreshnessLabel {
  readonly label: string
  readonly tone: 'current' | 'stale'
}

export interface CohortFilterFieldByScope {
  readonly event: 'kind' | 'name' | 'pagePath' | 'referrer' | 'destination' | 'unit' | 'code'
  readonly session:
    | 'device'
    | 'browser'
    | 'os'
    | 'country'
    | 'region'
    | 'city'
    | 'entryPage'
    | 'exitPage'
    | 'utmSource'
    | 'utmMedium'
    | 'utmCampaign'
  readonly profile: string
}

export interface CohortDateRange {
  readonly fromDate: string
  readonly toDate: string
}

export type CohortSelectionStatus = 'active' | 'archived' | 'all'

export interface CohortSelection {
  readonly cohortId: string | undefined
  readonly status: CohortSelectionStatus
}

export interface CohortQueryState {
  readonly siteId: string | undefined
  readonly selection: CohortSelection
  readonly range: CohortDateRange | undefined
  readonly comparison: boolean
  readonly filters: readonly CohortReportFilter[]
}

type CohortReportContractFilter = NonNullable<SCohortReportInput['filters']>[number]

export type CohortValueOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'

/** Value-level filters on event, session, and profile. The visitor scope and the
 *  has_done/has_not_done form are absent from the type, so a second identity
 *  population can never be attached to a report that already owns one. */
export type CohortFilterValues = string[]

type CohortAttributeFilter = Extract<
  Exclude<CohortReportContractFilter, { readonly scope: 'visitor' }>,
  { readonly operator: CohortValueOperator }
>

export type CohortReportFilter =
  | (Omit<Extract<CohortAttributeFilter, { readonly scope: 'event' }>, 'field' | 'values'> & {
      readonly field: CohortFilterFieldByScope['event']
      readonly values: CohortFilterValues
    })
  | (Omit<Extract<CohortAttributeFilter, { readonly scope: 'session' }>, 'field' | 'values'> & {
      readonly field: CohortFilterFieldByScope['session']
      readonly values: CohortFilterValues
    })
  | (Omit<Extract<CohortAttributeFilter, { readonly scope: 'profile' }>, 'field' | 'values'> & {
      readonly field: string
      readonly values: CohortFilterValues
    })

export type CohortFilterScope = CohortReportFilter['scope']

export interface CohortsController {
  readonly state: Readonly<ComputedRef<CohortsState>>
  readonly definitions: Readonly<ComputedRef<CohortDefinitionsLoadState>>
  readonly selectedReport: Readonly<ComputedRef<CohortReportOutcome>>
  readonly selectedDefinition: Readonly<ComputedRef<SCohort | undefined>>
  readonly cohortOptions: Readonly<ComputedRef<readonly CohortOption[]>>
  readonly definitionSubmitting: Readonly<ComputedRef<boolean>>
  readonly archiveSubmittingId: Readonly<ComputedRef<string | undefined>>
  readonly today: Readonly<ComputedRef<string>>
  query(): CohortQueryState
  resolveRange(): CohortDateRange
  getReportInput(): SCohortReportInput | null
  setCohortId(cohortId: string): void
  setSelectionStatus(status: CohortSelectionStatus): void
  setRange(range: CohortDateRange): void
  setComparison(enabled: boolean): void
  setFilters(filters: readonly CohortReportFilter[]): void
  clearFilters(): void
  create(draft: CohortDraft): Promise<void>
  update(input: { cohortId: string; draft: CohortDraft }): Promise<void>
  archive(cohortId: string): Promise<void>
  retryReport(): Promise<void>
}

export interface CohortDraft {
  readonly name: string
  readonly entryAction: CohortActionDraft
  readonly retentionAction: CohortActionDraft
  readonly identityKind: string
  readonly period: string
}

export type CohortActionDraft =
  | { readonly kind: 'page_view' }
  | { readonly kind: 'custom_event'; readonly name: string }
  | { readonly kind: 'outbound'; readonly name: string }
  | { readonly kind: 'performance'; readonly name: string }
  | { readonly kind: 'error'; readonly name: string }

export type CohortCompleteAction =
  | Exclude<CohortActionDraft, { readonly kind: 'outbound' }>
  | {
      readonly kind: 'outbound'
      readonly name: string
    }

/** Route query values as vue-router reports them. A null is an absent param, not an empty one. */
export type CohortRouteQueryValue = string | null | readonly (string | null)[]

/** The route query bag the page seeds from, keyed exactly as the page writes its params. */
export interface CohortRouteQuery {
  readonly cohort?: CohortRouteQueryValue
  readonly status?: CohortRouteQueryValue
  readonly from?: CohortRouteQueryValue
  readonly to?: CohortRouteQueryValue
  readonly compare?: CohortRouteQueryValue
  readonly filters?: CohortRouteQueryValue
}
