import {
  computed,
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { useOrpc } from '../../../composables/useOrpc'
import { isStringValue } from '../../../utils/type-guards'
import {
  createInitialPublicDashboardState,
  reducePublicDashboard,
} from './public-dashboard.reducer'
import type {
  PublicDashboardClient,
  PublicDashboardConfig,
  PublicDashboardFailure,
  PublicDashboardOperation,
  SitePublicDashboardController,
  SitePublicDashboardOptions,
} from './public-dashboard.types'
import { normalizePublicDashboardError, toPublicDashboardView } from './public-dashboard.utils'

type ReadOutcome =
  | { readonly kind: 'config'; readonly config: PublicDashboardConfig }
  | { readonly kind: 'absent' }
  | { readonly kind: 'failed'; readonly error: PublicDashboardFailure }

const INVALID_SITE_ID_FAILURE: PublicDashboardFailure = {
  kind: 'not-found',
  code: 'NOT_FOUND',
  httpStatus: 404,
  message: 'This Site is not available. Refresh or choose another Site.',
  action: 'refresh',
}

export function useSitePublicDashboard(
  options: SitePublicDashboardOptions,
): SitePublicDashboardController {
  const orpc: PublicDashboardClient = options.client ?? useOrpc()
  const state = shallowRef(createInitialPublicDashboardState())
  const view = computed(() => toPublicDashboardView(state.value))
  let requestVersion = 0
  let disposed = false

  async function refresh(): Promise<void> {
    await readConfig()
  }

  function request(operation: PublicDashboardOperation): void {
    state.value = reducePublicDashboard(state.value, { kind: 'operation-requested', operation })
  }

  function cancel(): void {
    state.value = reducePublicDashboard(state.value, { kind: 'operation-cancelled' })
  }

  async function confirm(): Promise<void> {
    const command = state.value.command

    if (command.kind !== 'confirming') return
    const siteId = requireSiteId()

    if (siteId === null) {
      state.value = reducePublicDashboard(state.value, {
        kind: 'operation-failed',
        operation: command.operation,
        error: INVALID_SITE_ID_FAILURE,
      })

      return
    }

    state.value = reducePublicDashboard(state.value, {
      kind: 'operation-started',
      operation: command.operation,
    })

    let config: PublicDashboardConfig | null

    try {
      config = await callOperation(siteId, command.operation)
    } catch (error: unknown) {
      if (disposed) return
      state.value = reducePublicDashboard(state.value, {
        kind: 'operation-failed',
        operation: command.operation,
        error: normalizePublicDashboardError(error, 'operation'),
      })

      return
    }

    if (disposed) return
    state.value = reducePublicDashboard(state.value, {
      kind: 'operation-succeeded',
      operation: command.operation,
      config,
    })

    // A silent read so the page shows server state, not the response the
    // command happened to return.
    const confirmed = await readConfig({ silent: true })

    if (disposed) return

    if (confirmed.kind === 'failed') {
      state.value = reducePublicDashboard(state.value, {
        kind: 'notice-warning',
        error: confirmed.error,
      })
    }
  }

  async function callOperation(
    siteId: string,
    operation: PublicDashboardOperation,
  ): Promise<PublicDashboardConfig | null> {
    if (operation === 'enable') {
      return await orpc.publicDashboard.enablePublicDashboard.call({ siteId })
    }

    if (operation === 'rotate') {
      return await orpc.publicDashboard.rotatePublicDashboardIdentifier.call({ siteId })
    }

    await orpc.publicDashboard.disablePublicDashboard.call({ siteId })

    return null
  }

  async function readConfig(readOptions: { silent?: boolean } = {}): Promise<ReadOutcome> {
    const version = ++requestVersion
    const siteId = requireSiteId()

    if (siteId === null) {
      state.value = reducePublicDashboard(state.value, {
        kind: 'config-failed',
        error: INVALID_SITE_ID_FAILURE,
      })

      return { kind: 'failed', error: INVALID_SITE_ID_FAILURE }
    }

    if (readOptions.silent !== true) {
      state.value = reducePublicDashboard(state.value, { kind: 'refresh-started' })
    }

    try {
      const config = await orpc.publicDashboard.getPublicDashboardConfig.call({ siteId })

      if (disposed || version !== requestVersion) {
        return { kind: 'failed', error: normalizePublicDashboardError({}, 'read') }
      }

      state.value = reducePublicDashboard(state.value, { kind: 'config-received', config })

      return { kind: 'config', config }
    } catch (error: unknown) {
      const failure = normalizePublicDashboardError(error, 'read')

      if (disposed || version !== requestVersion) return { kind: 'failed', error: failure }

      // The settings shell only renders this page for an active Site, so a
      // missing row here is a Site that has never been configured.
      if (failure.kind === 'not-found') {
        state.value = reducePublicDashboard(state.value, { kind: 'config-absent' })

        return { kind: 'absent' }
      }

      state.value = reducePublicDashboard(state.value, { kind: 'config-failed', error: failure })

      return { kind: 'failed', error: failure }
    }
  }

  function requireSiteId(): string | null {
    const siteId = toValue(options.siteId)

    return isStringValue(siteId) && siteId.trim() !== '' ? siteId : null
  }

  watch(
    () => toValue(options.siteId),
    () => void readConfig(),
  )

  if (getCurrentInstance() !== null) onMounted(() => void readConfig())

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
  })

  return { view, refresh, request, cancel, confirm }
}
