import { createApp, effectScope, nextTick, ref, type EffectScope } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '../../../composables/useAuth'
import { useCohorts } from './cohort-retention'
import type {
  CohortDefinitionsPage,
  CohortReportFailure,
  CohortRetentionClient,
  CohortsController,
  SCohort,
  SCohortReportOutput,
} from './cohort-retention.types'

const listCohorts = vi.fn()

const getRetentionReport = vi.fn()

const createCohort = vi.fn()

const updateCohort = vi.fn()

const archiveCohort = vi.fn()

const client: CohortRetentionClient = {
  cohortRetention: {
    listCohorts: { call: listCohorts },
    getRetentionReport: { call: getRetentionReport },
    createCohort: { call: createCohort },
    updateCohort: { call: updateCohort },
    archiveCohort: { call: archiveCohort },
  },
}

const session = ref<AuthState>({
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
})

const TODAY = '2026-07-01'

function definition(overrides: Partial<SCohort> = {}): SCohort {
  return {
    id: 'coh_1',
    siteId: 'ste_1',
    name: 'Trial to paid',
    entryAction: { kind: 'page_view' },
    retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
    identityKind: 'visitor',
    period: 'day',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function page(items: readonly SCohort[] = [definition()]): CohortDefinitionsPage {
  return { items: [...items], nextOffset: null, hasMore: false, totalCount: items.length }
}

function report(overrides: Partial<SCohortReportOutput> = {}): SCohortReportOutput {
  return {
    fromDate: '2026-06-20',
    toDate: TODAY,
    projectedAcceptanceSequence: 11,
    occurrenceTimeCoverageThrough: TODAY + 'T23:59:59Z',
    status: 'current',
    periods: [
      {
        index: 0,
        fromDate: '2026-06-20',
        toDate: TODAY,
        size: 100,
        retained: 40,
        rate: 0.4,
      },
    ],
    comparison: null,
    ...overrides,
  }
}

interface Harness {
  readonly controller: CohortsController
  readonly scope: EffectScope
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 8; pass += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

async function createHarness(
  overrides: {
    readonly routeQuery?: () => Record<string, string | readonly string[] | undefined>
    readonly siteId?: string | undefined
    readonly withSiteId?: boolean
  } = {},
): Promise<Harness> {
  const app = createApp({})
  const pinia = createPinia()

  app.use(pinia)
  app.use(PiniaColada, { pinia })

  const scope = effectScope()
  let controller: CohortsController | undefined

  scope.run(() => {
    app.runWithContext(() => {
      controller = useCohorts({
        siteId: overrides.withSiteId === true ? overrides.siteId : 'ste_1',
        client,
        today: () => TODAY,
        ...(overrides.routeQuery !== undefined && { routeQuery: overrides.routeQuery }),
      })
    })
  })

  if (controller === undefined) throw new Error('The controller was not created.')

  await settle()

  return { controller, scope }
}

function reportInputs(): readonly unknown[] {
  return getRetentionReport.mock.calls.map((call) => call[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.spyOn(toast, 'success')
  vi.stubGlobal('useState', (key: string) => (key === 'auth:session' ? session : ref(undefined)))
  listCohorts.mockResolvedValue(page())
  getRetentionReport.mockResolvedValue(report())
  createCohort.mockResolvedValue(definition({ id: 'coh_2' }))
  updateCohort.mockResolvedValue(definition())
  archiveCohort.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useCohorts', () => {
  it('loads the definitions for the resolved Site and the signed-in user', async () => {
    const { controller, scope } = await createHarness()

    expect(controller.definitions.value).toMatchObject({
      status: 'ready',
      definitions: [{ id: 'coh_1' }],
    })
    expect(listCohorts).toHaveBeenCalledTimes(1)
    expect(listCohorts.mock.calls[0]?.[0]).toMatchObject({ siteId: 'ste_1' })
    scope.stop()
  })

  it('reads the report for the selected cohort', async () => {
    const { controller, scope } = await createHarness()

    expect(controller.selectedReport.value).toMatchObject({ kind: 'ready' })
    expect(reportInputs()).toEqual([{ cohortId: 'coh_1', fromDate: '2026-06-20', toDate: TODAY }])
    scope.stop()
  })

  it('names the twelve-period bound as the blocked reason instead of fetching', async () => {
    const { controller, scope } = await createHarness()

    controller.setRange({ fromDate: '2026-01-01', toDate: '2026-01-20' })
    await settle()

    expect(controller.state.value).toMatchObject({
      status: 'report-blocked',
      reason: { kind: 'range-over-periods', maxPeriods: 12 },
    })
    expect(getRetentionReport).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('keeps an archived definition selectable and reportable', async () => {
    listCohorts.mockResolvedValue(page([definition({ status: 'archived' })]))
    const { controller, scope } = await createHarness()

    controller.setSelectionStatus('archived')
    await settle()

    expect(controller.selectedDefinition.value).toMatchObject({ status: 'archived' })
    expect(controller.selectedReport.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })

  it('never fetches while the Site is unresolved', async () => {
    const { controller, scope } = await createHarness({ siteId: undefined, withSiteId: true })
    await settle()

    expect(controller.state.value).toMatchObject({ status: 'idle' })
    expect(listCohorts).not.toHaveBeenCalled()
    expect(getRetentionReport).not.toHaveBeenCalled()
    scope.stop()
  })

  it('never fetches the report before a cohort is selected', async () => {
    listCohorts.mockResolvedValue(page([]))

    const { controller, scope } = await createHarness({
      routeQuery: () => ({ cohort: undefined }),
    })

    await settle()

    expect(controller.selectedReport.value).toMatchObject({ kind: 'blocked' })
    expect(getRetentionReport).not.toHaveBeenCalled()
    scope.stop()
  })

  it('refetches the report when the selected cohort changes', async () => {
    listCohorts.mockResolvedValue(page([definition(), definition({ id: 'coh_2', name: 'Second' })]))
    const { controller, scope } = await createHarness()

    controller.setCohortId('coh_2')
    await settle()

    expect(reportInputs()).toHaveLength(2)
    expect(reportInputs().at(-1)).toMatchObject({ cohortId: 'coh_2' })
    scope.stop()
  })

  it('sends the comparison window when the toggle is on', async () => {
    const { controller, scope } = await createHarness()

    controller.setComparison(true)
    await settle()

    expect(reportInputs().at(-1)).toMatchObject({
      cohortId: 'coh_1',
      comparison: { fromDate: '2026-06-08', toDate: '2026-06-19' },
    })
    scope.stop()
  })

  it('seeds the range, comparison, and filters from the route query', async () => {
    const { controller, scope } = await createHarness({
      routeQuery: () => ({
        cohort: 'coh_1',
        from: '2026-06-25',
        to: '2026-07-01',
        compare: '1',
        filters: encodeURIComponent(
          JSON.stringify([
            { scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] },
          ]),
        ),
      }),
    })

    expect(controller.query()).toEqual({
      siteId: 'ste_1',
      selection: { cohortId: 'coh_1', status: 'all' },
      range: { fromDate: '2026-06-25', toDate: '2026-07-01' },
      comparison: true,
      filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] }],
    })
    scope.stop()
  })

  it('announces an archive and keeps the report query key untouched', async () => {
    const { controller, scope } = await createHarness()
    const cache = (await import('@pinia/colada')).useQueryCache()
    const invalidate = vi.spyOn(cache, 'invalidateQueries')
    getRetentionReport.mockClear()

    await controller.archive('coh_1')

    expect(archiveCohort).toHaveBeenCalledTimes(1)
    expect(archiveCohort.mock.calls[0]?.[0]).toEqual({ siteId: 'ste_1', cohortId: 'coh_1' })
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(getRetentionReport).toHaveBeenCalledTimes(0)
    expect(invalidate).toHaveBeenCalledWith({
      key: ['cohort-retention', 'definitions', 'usr_1', 'ste_1'],
      exact: true,
    })
    scope.stop()
  })

  it('replaces the whole definition on update and invalidates the report', async () => {
    const { controller, scope } = await createHarness()

    await controller.update({
      cohortId: 'coh_1',
      draft: {
        name: 'Trial to paid',
        entryAction: { kind: 'page_view' },
        retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
        identityKind: 'identified_user',
        period: 'month',
      },
    })

    expect(updateCohort.mock.calls[0]?.[0]).toEqual({
      siteId: 'ste_1',
      cohortId: 'coh_1',
      name: 'Trial to paid',
      entryAction: { kind: 'page_view' },
      retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
      identityKind: 'identified_user',
      period: 'month',
    })
    expect(toast.success).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('keeps the definitions list and reports a mutation conflict inline', async () => {
    updateCohort.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = await createHarness()

    await expect(
      controller.update({
        cohortId: 'coh_1',
        draft: {
          name: 'Trial to paid',
          entryAction: { kind: 'page_view' },
          retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
          identityKind: 'visitor',
          period: 'day',
        },
      }),
    ).rejects.toBeTruthy()

    expect(controller.definitions.value).toMatchObject({ status: 'ready' })
    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })

  it('re-runs the report on retry', async () => {
    getRetentionReport.mockRejectedValueOnce({ code: 'SERVICE_UNAVAILABLE', status: 503 })
    const { controller, scope } = await createHarness()

    expect(controller.selectedReport.value).toMatchObject({
      kind: 'error',
      failure: { kind: 'service-unavailable' },
    })

    await controller.retryReport()

    expect(getRetentionReport).toHaveBeenCalledTimes(2)
    expect(controller.selectedReport.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })

  it('keeps the last report and reports a failed refresh beside it', async () => {
    const { controller, scope } = await createHarness()
    getRetentionReport.mockRejectedValueOnce({ code: 'SERVICE_UNAVAILABLE', status: 503 })
    await controller.retryReport()

    expect(controller.state.value).toMatchObject({
      status: 'report-stale-error',
      failure: { kind: 'service-unavailable' },
    })
    expect(controller.selectedReport.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })

  it('raises no toast when the archive fails', async () => {
    archiveCohort.mockRejectedValue({ code: 'NOT_FOUND', status: 404 })
    const { controller, scope } = await createHarness()

    await expect(controller.archive('coh_1')).rejects.toBeTruthy()

    expect(toast.success).not.toHaveBeenCalled()
    expect(controller.definitions.value).toMatchObject({ status: 'ready' })
    scope.stop()
  })
})

describe('useCohorts error mapping', () => {
  const cases: readonly { readonly cause: unknown; readonly kind: CohortReportFailure['kind'] }[] =
    [
      { cause: { code: 'UNAUTHORIZED', status: 401 }, kind: 'authentication' },
      { cause: { code: 'FORBIDDEN', status: 403 }, kind: 'forbidden' },
      { cause: { code: 'NOT_FOUND', status: 404 }, kind: 'not-found' },
      { cause: { code: 'QUERY_LIMIT_EXCEEDED', status: 429 }, kind: 'query-limit' },
      { cause: { code: 'SERVICE_UNAVAILABLE', status: 503 }, kind: 'service-unavailable' },
      { cause: { code: 'CONFLICT', status: 409 }, kind: 'conflict' },
      { cause: { code: 'BAD_REQUEST', status: 400 }, kind: 'invalid-request' },
    ]

  it.each(cases)('maps $kind to a distinct rendered state', async ({ cause, kind }) => {
    getRetentionReport.mockRejectedValue(cause)
    const { controller, scope } = await createHarness()

    expect(controller.selectedReport.value).toEqual({
      kind: 'error',
      failure: expect.objectContaining({ kind }),
    })
    scope.stop()
  })

  it('gives every documented code its own failure kind', async () => {
    const kinds = new Set(cases.map((entry) => entry.kind))

    expect(kinds.size).toBe(7)
  })

  it('maps a bare 429 with no code to the query budget', async () => {
    getRetentionReport.mockRejectedValue({ status: 429 })
    const { controller, scope } = await createHarness()

    expect(controller.selectedReport.value).toMatchObject({
      kind: 'error',
      failure: { kind: 'query-limit' },
    })
    scope.stop()
  })
})
