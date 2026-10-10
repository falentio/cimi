import { createApp, effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '../../../composables/useAuth'
import type {
  OverviewFilter,
  OverviewRange,
  TrafficBreakdownPage,
  TrafficOverviewPeriod,
} from './site-overview.types'
import { useSiteTraffic } from './useSiteTraffic'

const TODAY = '2026-05-27T12:00:00.000Z'

interface TrafficRequest {
  readonly siteId: string
  readonly fromDate: string
  readonly toDate: string
  readonly granularity: string
  readonly comparison?: { readonly fromDate: string; readonly toDate: string } | undefined
}

interface BreakdownRequest extends TrafficRequest {
  readonly dimension: string
  readonly limit: number
}

interface CallOptions {
  readonly signal: AbortSignal
}

const AUTHENTICATED_SESSION: AuthState = {
  status: 'authenticated',
  session: {
    user: {
      id: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: null,
      role: 'user',
    },
  },
}

const session = ref<AuthState>(AUTHENTICATED_SESSION)

function period(overrides: Partial<TrafficOverviewPeriod> = {}): TrafficOverviewPeriod {
  return {
    fromDate: '2026-05-21',
    toDate: '2026-05-27',
    visitors: 24_860,
    sessions: 18_942,
    eligibleSessions: 18_000,
    sessionsWithValidDuration: 17_500,
    pageviews: 62_104,
    bounceRate: 0.324,
    pagesPerSession: 3.28,
    averageSessionDurationSeconds: 138,
    trend: [
      {
        at: '2026-05-27T00:00:00.000Z',
        value: 40,
        complete: true,
        metric: 'visitors',
        grain: 'visitor',
        unit: 'count',
        denominator: null,
      },
    ],
    projectedAcceptanceSequence: 7,
    occurrenceTimeCoverageThrough: '2026-05-27T23:59:59.999Z',
    status: 'current',
    ...overrides,
  }
}

const breakdownPage: TrafficBreakdownPage = {
  items: [
    {
      value: '/',
      metric: 'sessions',
      grain: 'session',
      count: 40,
      denominator: 60,
      percentage: 0.667,
    },
  ],
  nextOffset: null,
  hasMore: false,
  totalCount: 1,
  projectedAcceptanceSequence: 7,
  occurrenceTimeCoverageThrough: '2026-05-27T23:59:59.999Z',
  status: 'current',
}

const getSite = vi.fn()

const getTrafficOverview =
  vi.fn<(input: TrafficRequest, options: CallOptions) => Promise<TrafficOverviewPeriod>>()

const getTrafficBreakdowns =
  vi.fn<(input: BreakdownRequest, options: CallOptions) => Promise<TrafficBreakdownPage>>()

const orpc = {
  site: { getSite: { call: getSite } },
  trafficReport: {
    getTrafficOverview: { call: getTrafficOverview },
    getTrafficBreakdowns: { call: getTrafficBreakdowns },
  },
}

type Controller = ReturnType<typeof useSiteTraffic>

interface Harness {
  readonly controller: Controller
  readonly scope: EffectScope
}

function breakdownDimensions(): readonly string[] {
  return getTrafficBreakdowns.mock.calls.map((call) => call[0].dimension)
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
  }
}

interface MutableOptions {
  readonly siteId: Ref<string | undefined>
  readonly range: Ref<OverviewRange>
  readonly filters: Ref<readonly OverviewFilter[]>
  readonly comparison: Ref<boolean>
}

function createOptions(): MutableOptions {
  return {
    siteId: ref<string | undefined>('ste_1'),
    range: ref<OverviewRange>('7d'),
    filters: ref<readonly OverviewFilter[]>([]),
    comparison: ref(false),
  }
}

async function createHarness(overrides: Partial<MutableOptions> = {}): Promise<Harness> {
  const options: MutableOptions = { ...createOptions(), ...overrides }
  const app = createApp({})
  app.use(createPinia())
  app.use(PiniaColada, { pinia: app._context.provides.pinia })
  const scope = effectScope()
  const controller = scope.run(() => app.runWithContext(() => useSiteTraffic(options)))

  if (controller === undefined) throw new Error('Controller was not created.')

  await settle()

  return { controller, scope }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(TODAY))
  vi.clearAllMocks()
  session.value = AUTHENTICATED_SESSION
  getSite.mockResolvedValue({ id: 'ste_1', reportingTimezone: 'UTC' })
  getTrafficOverview.mockResolvedValue(period())
  getTrafficBreakdowns.mockResolvedValue(breakdownPage)
  vi.stubGlobal('useNuxtApp', () => ({ $orpc: orpc }))
  vi.stubGlobal('useState', (key: string) => (key === 'auth:session' ? session : ref(undefined)))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useSiteTraffic', () => {
  it('reads the Site reporting timezone before it resolves the range', async () => {
    const { scope } = await createHarness()

    expect(getSite).toHaveBeenCalledWith({ siteId: 'ste_1' }, expect.anything())
    expect(getTrafficOverview).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-05-21', toDate: '2026-05-27', granularity: 'day' }),
      expect.anything(),
    )
    scope.stop()
  })

  it('renders every metric card from the period totals', async () => {
    const { controller, scope } = await createHarness()
    const load = controller.load.value

    expect(load.status).toBe('ready')
    expect(load.status === 'ready' && load.view.metrics.map((metric) => metric.id)).toEqual([
      'visitors',
      'pageviews',
      'sessions',
      'bounce_rate',
      'pages_per_session',
      'average_session_duration_seconds',
    ])
    scope.stop()
  })

  it('requests a comparison window only when comparison is on', async () => {
    const { controller, scope } = await createHarness({ comparison: ref(true) })

    expect(getTrafficOverview).toHaveBeenCalledWith(
      expect.objectContaining({ comparison: { fromDate: '2026-05-14', toDate: '2026-05-20' } }),
      expect.anything(),
    )
    expect(controller.load.value.status).toBe('ready')
    scope.stop()
  })

  it('omits the comparison key entirely when comparison is off', async () => {
    const { scope } = await createHarness()

    const request = getTrafficOverview.mock.calls.at(0)?.[0]

    expect(request).toBeDefined()
    expect(Object.hasOwn(request ?? {}, 'comparison')).toBe(false)
    scope.stop()
  })

  it('reads only the active tab of each section, not every tab it offers', async () => {
    const { scope } = await createHarness()

    expect(
      [...new Set(breakdownDimensions())].sort((left, right) => left.localeCompare(right)),
    ).toEqual(['country', 'device', 'page', 'referrer'])
    scope.stop()
  })

  it('grows a section page when more rows are requested', async () => {
    const { controller, scope } = await createHarness()

    controller.loadMore('pages')

    await settle()

    const pageCalls = getTrafficBreakdowns.mock.calls.filter((call) => call[0].dimension === 'page')

    expect(pageCalls.at(-1)?.[0].limit).toBe(40)
    scope.stop()
  })

  it('switches a section to another tab and requests that dimension', async () => {
    const { controller, scope } = await createHarness()

    controller.selectTab('countries', 'regions')

    await settle()

    expect(breakdownDimensions()).toContain('region')
    scope.stop()
  })

  it('reports a retired range as a query-limit outcome instead of clamping it', async () => {
    getTrafficOverview.mockRejectedValue({ code: 'QUERY_LIMIT_EXCEEDED', message: 'Query limit' })
    const { controller, scope } = await createHarness()

    expect(controller.load.value).toMatchObject({ status: 'error', error: { kind: 'query-limit' } })
    scope.stop()
  })

  it('reports an absent Site as not found rather than forbidden', async () => {
    getSite.mockRejectedValue({ code: 'NOT_FOUND', message: 'Not found' })
    const { controller, scope } = await createHarness()

    expect(controller.load.value).toMatchObject({ status: 'error', error: { kind: 'not-found' } })
    scope.stop()
  })

  it('reports an analytics store that is not ready as unavailable', async () => {
    getTrafficOverview.mockRejectedValue({ code: 'SERVICE_UNAVAILABLE', message: 'Unavailable' })
    const { controller, scope } = await createHarness()

    expect(controller.load.value).toMatchObject({ status: 'error', error: { kind: 'unavailable' } })
    scope.stop()
  })

  it('does not fetch until the session is authenticated', async () => {
    session.value = { status: 'unauthenticated' }
    const { controller, scope } = await createHarness()

    expect(getTrafficOverview).not.toHaveBeenCalled()
    expect(controller.load.value.status).toBe('loading')
    scope.stop()
  })

  it('clears tab and paging state when the Site changes so nothing leaks across Sites', async () => {
    const options = createOptions()
    const { controller, scope } = await createHarness({ siteId: options.siteId })

    controller.selectTab('countries', 'regions')

    await settle()

    const regionCallsAfterSelect = breakdownDimensions().filter(
      (dimension) => dimension === 'region',
    ).length

    expect(regionCallsAfterSelect).toBeGreaterThan(0)

    options.siteId.value = 'ste_2'

    await settle()

    expect(getSite).toHaveBeenCalledWith({ siteId: 'ste_2' }, expect.anything())
    expect(breakdownDimensions().filter((dimension) => dimension === 'region').length).toBe(
      regionCallsAfterSelect,
    )
    scope.stop()
  })
})
