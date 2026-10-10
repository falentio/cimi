import { useQuery, useQueryCache } from '@pinia/colada'
import { today } from '@internationalized/date'
import { computed, shallowRef, toValue, watch, type ComputedRef, type Ref } from 'vue'
import { useAuth } from '../../../composables/useAuth'
import { useOrpc } from '../../../composables/useOrpc'
import { normalizeSettingsError } from '../../../utils/settings-error'
import { overviewBreakdownSections } from './site-overview-breakdowns'
import { type OverviewMappingInput, toSiteTrafficView } from './site-overview.mapper'
import { overviewRangeGranularity, resolveOverviewRangeRequest } from './site-overview.range'
import type {
  OverviewBreakdownDimension,
  OverviewFilter,
  OverviewRange,
  SiteTrafficError,
  SiteTrafficErrorKind,
  SiteTrafficLoadState,
  SiteTrafficView,
  TrafficBreakdownPage,
} from './site-overview.types'

const BREAKDOWN_PAGE_SIZE = 20

/** SPageSize caps a request at 100 rows, and a response carries at most 100 items. */
const MAX_BREAKDOWN_PAGE = 100

const TRAFFIC_QUERY_KEY = ['traffic'] as const

const SITE_QUERY_KEY = ['site'] as const

const FALLBACK_ERROR_MESSAGE = 'Site traffic could not be loaded.'

export interface SiteTrafficOptions {
  readonly siteId: Readonly<Ref<string | undefined>>
  readonly range: Readonly<Ref<OverviewRange>>
  readonly filters: Readonly<Ref<readonly OverviewFilter[]>>
  readonly comparison: Readonly<Ref<boolean>>
}

export interface SiteTrafficController {
  readonly load: ComputedRef<SiteTrafficLoadState>
  readonly view: ComputedRef<SiteTrafficView | null>
  readonly loadMore: (sectionId: string) => void
  readonly selectTab: (sectionId: string, tabId: string) => void
  readonly refresh: () => Promise<void>
}

/** Maps a contract error code onto the outcome the page renders. */
function toTrafficErrorKind(code: string | undefined): SiteTrafficErrorKind {
  switch (code) {
    case 'NOT_FOUND':
      return 'not-found'
    case 'QUERY_LIMIT_EXCEEDED':
      return 'query-limit'
    case 'SERVICE_UNAVAILABLE':
      return 'unavailable'
    case 'BAD_REQUEST':
      return 'bad-request'
    case 'UNAUTHORIZED':
      return 'unauthenticated'
    default:
      return 'unknown'
  }
}

/**
 * The page's only data source. Owns fetching, Site-local range resolution, query keys scoped by
 * user and Site, and the mapping onto one render-ready view. Never blocks on the human: an
 * unreadable Site reports the same error the traffic read would.
 */
export function useSiteTraffic(options: SiteTrafficOptions): SiteTrafficController {
  const { session } = useAuth()
  const orpc = useOrpc()
  const queryCache = useQueryCache()

  const currentUserId = computed(() => {
    const state = session.value

    return state.status === 'authenticated' ? state.session.user.id : null
  })

  const enabled = computed(
    () => currentUserId.value !== null && toValue(options.siteId) !== undefined,
  )

  const siteId = computed(() => toValue(options.siteId))

  const range = computed(() => toValue(options.range))

  const filters = computed(() => toValue(options.filters))

  const comparison = computed(() => toValue(options.comparison))

  const breakdownLimits = shallowRef<Readonly<Record<string, number>>>({})

  const activeTabs = shallowRef<Readonly<Record<string, string>>>({})

  const siteQuery = useQuery({
    key: computed(() => [...SITE_QUERY_KEY, currentUserId.value, siteId.value ?? null]),
    enabled,
    query: async ({ signal }) => {
      const current = siteId.value

      if (current === undefined) throw new Error('Choose a site before loading its traffic.')

      const site = await orpc.site.getSite.call({ siteId: current }, { signal })

      return site.reportingTimezone
    },
  })

  const timezone = computed(() => siteQuery.data.value)

  const siteReady = computed(() => enabled.value && timezone.value !== undefined)

  /**
   * Both reads share one resolved range, so the overview and the breakdowns can never disagree
   * about which days they cover, even across a midnight boundary between two calls.
   */
  const rangeFields = computed(() => {
    const zone = timezone.value

    if (zone === undefined) return null

    const request = resolveOverviewRangeRequest(
      range.value,
      today(zone).toString(),
      comparison.value,
    )

    const fields = {
      fromDate: request.fromDate,
      toDate: request.toDate,
      granularity: request.granularity,
    }

    return request.comparison === undefined ? fields : { ...fields, comparison: request.comparison }
  })

  const overviewQuery = useQuery({
    key: computed(() => [
      ...TRAFFIC_QUERY_KEY,
      'overview',
      currentUserId.value,
      siteId.value ?? null,
      range.value,
      filters.value,
      comparison.value,
    ]),
    enabled: siteReady,
    query: async ({ signal }) => {
      const current = siteId.value
      const fields = rangeFields.value

      if (current === undefined || fields === null) {
        throw new Error('Choose a site before loading its traffic.')
      }

      if (fields === null) throw new Error('Choose a site before loading its traffic.')

      return orpc.trafficReport.getTrafficOverview.call({ siteId: current, ...fields }, { signal })
    },
  })

  const breakdownQueries = overviewBreakdownSections.map((section) => {
    const activeTab = computed(() => activeTabs.value[section.id] ?? section.tabs[0]?.id ?? '')

    const dimension = computed<OverviewBreakdownDimension | undefined>(
      () => section.tabs.find((tab) => tab.id === activeTab.value)?.dimension,
    )

    const limit = computed(() => breakdownLimits.value[section.id] ?? BREAKDOWN_PAGE_SIZE)

    const query = useQuery({
      key: computed(() => [
        ...TRAFFIC_QUERY_KEY,
        'breakdown',
        currentUserId.value,
        siteId.value ?? null,
        dimension.value,
        range.value,
        filters.value,
        comparison.value,
        limit.value,
      ]),
      enabled: computed(() => siteReady.value && dimension.value !== undefined),
      query: async ({ signal }) => {
        const current = siteId.value
        const activeDimension = dimension.value
        const fields = rangeFields.value

        if (current === undefined || activeDimension === undefined || fields === null) {
          throw new Error('Choose a site before loading its traffic.')
        }

        if (fields === null) throw new Error('Choose a site before loading its traffic.')

        return orpc.trafficReport.getTrafficBreakdowns.call(
          { siteId: current, dimension: activeDimension, limit: limit.value, ...fields },
          { signal },
        )
      },
    })

    return { section, activeTab, dimension, query }
  })

  const error = computed<SiteTrafficError | null>(() => {
    const causes = [
      siteQuery.error.value,
      overviewQuery.error.value,
      ...breakdownQueries.map((item) => item.query.error.value),
    ].filter((cause) => cause !== null)

    const cause = causes.at(0)

    if (cause === undefined) return null

    const localizable = normalizeSettingsError(cause, FALLBACK_ERROR_MESSAGE)

    return { kind: toTrafficErrorKind(localizable.code), message: localizable.message }
  })

  const view = computed<SiteTrafficView | null>(() => {
    const overview = overviewQuery.data.value

    if (overview === undefined) return null

    const breakdowns = new Map<string, TrafficBreakdownPage>()

    for (const item of breakdownQueries) {
      const page = item.query.data.value

      if (page !== undefined) breakdowns.set(item.section.id + ':' + item.activeTab.value, page)
    }

    const mapping: OverviewMappingInput = {
      range: range.value,
      granularity: overviewRangeGranularity(range.value),
      overview,
      comparison: overview.comparison ?? null,
      breakdowns,
      activeTabs: activeTabs.value,
      pageLimits: breakdownLimits.value,
    }

    return toSiteTrafficView(mapping)
  })

  const load = computed<SiteTrafficLoadState>(() => {
    const failure = error.value

    if (failure !== null) return { status: 'error', error: failure }

    const current = view.value

    if (current === null) return { status: 'loading' }

    return { status: 'ready', view: current }
  })

  function loadMore(sectionId: string): void {
    const current = breakdownLimits.value[sectionId] ?? BREAKDOWN_PAGE_SIZE

    if (current >= MAX_BREAKDOWN_PAGE) return

    const next = Math.min(current + BREAKDOWN_PAGE_SIZE, MAX_BREAKDOWN_PAGE)

    breakdownLimits.value = { ...breakdownLimits.value, [sectionId]: next }
  }

  function selectTab(sectionId: string, tabId: string): void {
    activeTabs.value = { ...activeTabs.value, [sectionId]: tabId }
  }

  watch(siteId, () => {
    breakdownLimits.value = {}
    activeTabs.value = {}
  })

  async function refresh(): Promise<void> {
    await queryCache.invalidateQueries({ key: TRAFFIC_QUERY_KEY })
    await queryCache.invalidateQueries({ key: SITE_QUERY_KEY, exact: true })
  }

  return { load, view, loadMore, selectTab, refresh }
}
