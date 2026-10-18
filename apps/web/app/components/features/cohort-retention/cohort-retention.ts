import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, getCurrentInstance, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useAuth } from '../../../composables/useAuth'
import { useOrpc } from '../../../composables/useOrpc'
import { isNumberValue, isStringValue } from '../../../utils/type-guards'
import { cohortQueryFromRoute } from './cohort-query'
import { toCohortDefinitionFields, toCohortUpdateFields } from './cohort-draft'
import { normalizeCohortFilters } from './cohort-filters'
import {
  clampCohortRange,
  cohortReportRequestKey,
  defaultCohortRange,
  isCurrentCohortRequest,
  resolveCohortReportRequest,
} from './cohort-report-query'
import type {
  CohortDateRange,
  CohortDefinitionsLoadState,
  CohortDraft,
  CohortOption,
  CohortQueryState,
  CohortReportFailure,
  CohortReportFilter,
  CohortReportOutcome,
  CohortRetentionClient,
  CohortRouteQuery,
  CohortRouteQueryValue,
  CohortsController,
  CohortsOptions,
  CohortsState,
  CohortSelectionStatus,
  SCohort,
  SCohortCreateInput,
  SCohortIdentityFields,
  SCohortReportOutput,
  SCohortUpdateInput,
} from './cohort-retention.types'

const DEFINITIONS_QUERY_KEY = ['cohort-retention', 'definitions'] as const

const REPORT_QUERY_KEY = ['cohort-retention', 'report'] as const

const COHORT_CREATED_MESSAGE = 'Cohort definition created.'

const COHORT_UPDATED_MESSAGE = 'Cohort definition updated.'

const COHORT_ARCHIVED_MESSAGE =
  'Cohort archived. Its retention reports stay available and reportable.'

export function normalizeCohortReportError(
  cause: unknown,
  source: 'report' | 'list' | 'mutation',
): CohortReportFailure {
  const details = readErrorDetails(cause)

  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return {
      kind: 'authentication',
      message: 'Sign in to read cohort retention reports.',
      action: 'sign-in',
    }
  }

  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return {
      kind: 'forbidden',
      message: 'Your account cannot read cohort retention reports for this Site.',
      action: 'contact-admin',
    }
  }

  if (details.code === 'NOT_FOUND' || details.status === 404) {
    return {
      kind: 'not-found',
      message: 'This Site or cohort is no longer available. Refresh and choose another.',
      action: 'refresh',
    }
  }

  if (details.code === 'QUERY_LIMIT_EXCEEDED' || details.status === 429) {
    return {
      kind: 'query-limit',
      message: 'This report asks for more data than the query budget allows. Shorten the range.',
      action: 'adjust-range',
    }
  }

  if (details.code === 'SERVICE_UNAVAILABLE' || details.status === 503) {
    return {
      kind: 'service-unavailable',
      message: 'The retention report service is unavailable. Try again shortly.',
      action: 'retry',
    }
  }

  if (details.code === 'CONFLICT' || details.status === 409) {
    return {
      kind: 'conflict',
      message: 'Another change landed first. Refresh before retrying.',
      action: 'refresh',
    }
  }

  if (details.code === 'BAD_REQUEST' || details.status === 400) {
    return {
      kind: 'invalid-request',
      message: 'The server rejected this request. Adjust the range or filters and try again.',
      action: 'adjust-range',
    }
  }

  if (source === 'mutation') {
    return {
      kind: 'service-unavailable',
      message: 'The cohort change could not be completed. Try again shortly.',
      action: 'retry',
    }
  }

  return {
    kind: 'not-found',
    message: 'The cohort retention data could not be loaded. Refresh and try again.',
    action: 'refresh',
  }
}

export function useCohorts(options: CohortsOptions): CohortsController {
  const client: CohortRetentionClient = options.client ?? useOrpc()
  const { session } = useAuth()
  const queryCache = useQueryCache()
  const resolvedSiteId = computed(() => toValue(options.siteId))
  const authenticated = computed(() => session.value.status === 'authenticated')

  const currentUserId = computed(() => {
    const state = session.value

    return state.status === 'authenticated' ? state.session.user.id : undefined
  })

  const today = computed(() => options.today?.() ?? utcToday())

  const routeQuery = readRouteQuery(options)

  const initial = cohortQueryFromRoute({
    siteIdParam: toValue(options.siteId),
    cohortParam: toRouteParam(routeQuery.cohort),
    statusParam: toRouteParam(routeQuery.status),
    fromParam: toRouteParam(routeQuery.from),
    toParam: toRouteParam(routeQuery.to),
    compareParam: toRouteParam(routeQuery.compare),
    filtersParam: toRouteParam(routeQuery.filters),
  })

  const selectedCohortId = shallowRef<string | undefined>(initial.selection.cohortId)
  const selectionStatus = shallowRef(initial.selection.status)
  const rangeState = shallowRef<CohortDateRange | undefined>(initial.range)
  const comparisonEnabled = shallowRef(initial.comparison)
  const filterState = shallowRef<readonly CohortReportFilter[]>(initial.filters)
  const definitionSubmitting = shallowRef(false)
  const archiveSubmittingId = shallowRef<string | undefined>()
  let contextVersion = 0

  onScopeDispose(() => {
    contextVersion += 1
  })

  watch([resolvedSiteId, currentUserId], () => {
    contextVersion += 1
    definitionSubmitting.value = false
    archiveSubmittingId.value = undefined
  })

  const definitionsKey = computed(() => [
    ...DEFINITIONS_QUERY_KEY,
    currentUserId.value ?? null,
    resolvedSiteId.value ?? null,
  ])

  const definitionsQuery = useQuery<
    Awaited<ReturnType<CohortRetentionClient['cohortRetention']['listCohorts']['call']>>,
    unknown
  >({
    key: definitionsKey,
    enabled: computed(() => authenticated.value && resolvedSiteId.value !== undefined),
    query: ({ signal }) =>
      client.cohortRetention.listCohorts.call(
        { siteId: requireSiteId(resolvedSiteId.value) },
        { signal },
      ),
  })

  const createMutation = useMutation({
    mutation: (input: SCohortCreateInput) => client.cohortRetention.createCohort.call(input),
  })

  const updateMutation = useMutation({
    mutation: (input: SCohortUpdateInput) => client.cohortRetention.updateCohort.call(input),
  })

  const archiveMutation = useMutation({
    mutation: (input: SCohortIdentityFields) => client.cohortRetention.archiveCohort.call(input),
  })

  const definitions = computed<readonly SCohort[]>(() => definitionsQuery.data.value?.items ?? [])

  watch(
    definitions,
    (items) => {
      const selected = selectedCohortId.value

      if (selected !== undefined && items.some((definition) => definition.id === selected)) return

      selectedCohortId.value = items[0]?.id
    },
    { immediate: true },
  )

  const selectedDefinition = computed<SCohort | undefined>(() =>
    definitions.value.find((definition) => definition.id === selectedCohortId.value),
  )

  const cohortOptions = computed<readonly CohortOption[]>(() =>
    definitions.value
      .filter(
        (definition) =>
          selectionStatus.value === 'all' || definition.status === selectionStatus.value,
      )
      .map((definition) => ({
        cohortId: definition.id,
        name: definition.name,
        status: definition.status,
      })),
  )

  const resolveRange = (): CohortDateRange => {
    const period = selectedDefinition.value?.period

    return rangeState.value === undefined || period === undefined
      ? defaultCohortRange(period ?? 'week', today.value)
      : clampCohortRange(rangeState.value, period, today.value)
  }

  const reportRequest = computed(() =>
    resolveCohortReportRequest({
      siteId: resolvedSiteId.value,
      cohort: selectedDefinition.value,
      selectionStatus: selectionStatus.value,
      range: rangeState.value,
      comparison: comparisonEnabled.value,
      filters: filterState.value,
      today: () => today.value,
    }),
  )

  const reportKey = computed(() => [
    ...REPORT_QUERY_KEY,
    currentUserId.value ?? null,
    resolvedSiteId.value ?? null,
    cohortReportRequestKey(reportRequest.value),
  ])

  const reportQuery = useQuery<SCohortReportOutput, unknown>({
    key: reportKey,
    enabled: computed(() => authenticated.value && reportRequest.value.kind === 'input'),
    query: async ({ signal }) => {
      const request = reportRequest.value

      if (request.kind !== 'input') {
        throw new Error('A blocked report request never reaches the server.')
      }

      return await client.cohortRetention.getRetentionReport.call(request.input, { signal })
    },
  })

  const definitionsLoad = computed<CohortDefinitionsLoadState>(() => {
    const siteId = resolvedSiteId.value

    if (siteId === undefined) return { status: 'idle' }

    const items = definitions.value
    const error = definitionsQuery.error.value

    if (items.length > 0) {
      if (definitionsQuery.isLoading.value) return { status: 'refreshing', definitions: items }

      if (error !== null) {
        return {
          status: 'stale-error',
          definitions: items,
          failure: normalizeCohortReportError(error, 'list'),
        }
      }

      return { status: 'ready', definitions: items }
    }

    if (definitionsQuery.isLoading.value || error === null) return { status: 'loading' }

    return { status: 'error', failure: normalizeCohortReportError(error, 'list') }
  })

  const selectedReport = computed<CohortReportOutcome>(() => {
    const request = reportRequest.value

    if (request.kind === 'blocked') return { kind: 'blocked', reason: request.reason }

    if (definitionsLoad.value.status === 'ready' && definitions.value.length === 0) {
      return { kind: 'empty', reason: 'no-selection' }
    }

    const report = reportQuery.data.value
    const error = reportQuery.error.value

    if (report !== undefined) {
      return { kind: 'ready', report, current: isCurrentCohortRequest(request, today.value) }
    }

    if (error !== null) {
      return { kind: 'error', failure: normalizeCohortReportError(error, 'report') }
    }

    return { kind: 'loading' }
  })

  const reportFailure = computed<CohortReportFailure | null>(() => {
    const error = reportQuery.error.value

    return error === null ? null : normalizeCohortReportError(error, 'report')
  })

  const state = computed<CohortsState>(() => {
    const load = definitionsLoad.value

    if (load.status === 'idle') return { status: 'idle' }

    if (load.status === 'loading') return { status: 'loading' }

    if (load.status === 'error') return { status: 'definitions-error', failure: load.failure }

    const outcome = selectedReport.value

    if (outcome.kind === 'blocked') return { status: 'report-blocked', reason: outcome.reason }

    if (outcome.kind === 'error') return { status: 'report-error', failure: outcome.failure }

    if (outcome.kind === 'ready') {
      const failure = reportFailure.value

      if (failure !== null) return { status: 'report-stale-error', report: outcome.report, failure }

      return outcome.current
        ? { status: 'report-current', report: outcome.report }
        : { status: 'report-ready' }
    }

    if (outcome.kind === 'empty') return { status: 'report-ready' }

    return { status: 'loading' }
  })

  function query(): CohortQueryState {
    return {
      siteId: resolvedSiteId.value,
      selection: { cohortId: selectedCohortId.value, status: selectionStatus.value },
      range: rangeState.value,
      comparison: comparisonEnabled.value,
      filters: filterState.value,
    }
  }

  function getReportInput() {
    const request = reportRequest.value

    return request.kind === 'input' ? request.input : null
  }

  function setCohortId(cohortId: string): void {
    selectedCohortId.value = cohortId
  }

  function setSelectionStatus(status: CohortSelectionStatus): void {
    selectionStatus.value = status
  }

  function setRange(range: CohortDateRange): void {
    rangeState.value = range
  }

  function setComparison(enabled: boolean): void {
    comparisonEnabled.value = enabled
  }

  function setFilters(filters: readonly CohortReportFilter[]): void {
    filterState.value = normalizeCohortFilters(filters)
  }

  function clearFilters(): void {
    filterState.value = []
  }

  async function create(draft: CohortDraft): Promise<void> {
    const siteId = requireSiteId(resolvedSiteId.value)
    const operationContext = ++contextVersion
    definitionSubmitting.value = true

    try {
      await createMutation.mutateAsync(toCohortDefinitionFields({ draft, siteId }))
    } finally {
      if (operationContext === contextVersion) definitionSubmitting.value = false
    }

    if (operationContext !== contextVersion) return

    toast.success(COHORT_CREATED_MESSAGE)
    await invalidateDefinitions()
  }

  async function update(input: { cohortId: string; draft: CohortDraft }): Promise<void> {
    const siteId = requireSiteId(resolvedSiteId.value)
    const operationContext = ++contextVersion
    definitionSubmitting.value = true

    try {
      await updateMutation.mutateAsync(
        toCohortUpdateFields({ draft: input.draft, siteId, cohortId: input.cohortId }),
      )
    } finally {
      if (operationContext === contextVersion) definitionSubmitting.value = false
    }

    if (operationContext !== contextVersion) return

    toast.success(COHORT_UPDATED_MESSAGE)
    await Promise.all([invalidateDefinitions(), invalidateReports()])
  }

  async function archive(cohortId: string): Promise<void> {
    const siteId = requireSiteId(resolvedSiteId.value)
    const operationContext = ++contextVersion
    archiveSubmittingId.value = cohortId

    try {
      await archiveMutation.mutateAsync({ siteId, cohortId })
    } finally {
      if (operationContext === contextVersion) archiveSubmittingId.value = undefined
    }

    if (operationContext !== contextVersion) return

    toast.success(COHORT_ARCHIVED_MESSAGE)
    await invalidateDefinitions()
  }

  async function retryReport(): Promise<void> {
    await reportQuery.refetch()
  }

  async function invalidateDefinitions(): Promise<void> {
    await queryCache.invalidateQueries({ key: definitionsKey.value, exact: true })
  }

  async function invalidateReports(): Promise<void> {
    await queryCache.invalidateQueries({ key: [...REPORT_QUERY_KEY] })
  }

  return {
    state,
    definitions: definitionsLoad,
    selectedReport,
    selectedDefinition,
    cohortOptions,
    definitionSubmitting: computed(() => definitionSubmitting.value),
    archiveSubmittingId: computed(() => archiveSubmittingId.value),
    today,
    query,
    resolveRange,
    getReportInput,
    setCohortId,
    setSelectionStatus,
    setRange,
    setComparison,
    setFilters,
    clearFilters,
    create,
    update,
    archive,
    retryReport,
  }
}

function requireSiteId(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error('Choose a site before reading its cohort retention data.')
  }

  return value
}

function readRouteQuery(options: CohortsOptions): CohortRouteQuery {
  if (options.routeQuery !== undefined) return options.routeQuery()

  // No component scope means no route to seed from; the caller owns no query state yet.
  if (getCurrentInstance() === null) return emptyRouteQuery()

  const query = useRoute().query

  return {
    cohort: query.cohort,
    status: query.status,
    from: query.from,
    to: query.to,
    compare: query.compare,
    filters: query.filters,
  }
}

/** Absent route params arrive as null; the pure query decoder only accepts present values. */
function toRouteParam(
  value: CohortRouteQueryValue | undefined,
): string | readonly string[] | undefined {
  if (value === null || value === undefined) return undefined

  if (isStringValue(value)) return value

  return value.filter((entry): entry is string => entry !== null)
}

function emptyRouteQuery(): CohortRouteQuery {
  return {
    cohort: undefined,
    status: undefined,
    from: undefined,
    to: undefined,
    compare: undefined,
    filters: undefined,
  }
}

function utcToday(): string {
  const now = new Date()

  return (
    String(now.getUTCFullYear()).padStart(4, '0') +
    '-' +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getUTCDate()).padStart(2, '0')
  )
}

interface ErrorDetails {
  readonly code?: unknown
  readonly status?: unknown
  readonly statusCode?: unknown
}

function readErrorDetails(cause: unknown): {
  code: string | undefined
  status: number | undefined
} {
  return isRecord(cause)
    ? {
        code: isStringValue(cause.code) ? cause.code : undefined,
        status: isNumberValue(cause.status)
          ? cause.status
          : isNumberValue(cause.statusCode)
            ? cause.statusCode
            : undefined,
      }
    : { code: undefined, status: undefined }
}

function isRecord(value: unknown): value is ErrorDetails {
  return value !== null && typeof value === 'object'
}
