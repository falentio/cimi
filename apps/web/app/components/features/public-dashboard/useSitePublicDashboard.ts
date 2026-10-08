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
  PublicDashboardFailure,
  PublicDashboardOperation,
  SitePublicDashboardController,
  SitePublicDashboardOptions,
} from './public-dashboard.types'
import { normalizePublicDashboardError, toPublicDashboardView } from './public-dashboard.utils'

type ReadIntent = 'refresh' | 'reconcile'

type ReadOutcome =
  | { readonly kind: 'settled' }
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
    await readConfig('refresh')
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

    try {
      if (command.operation === 'disable') {
        await orpc.publicDashboard.disablePublicDashboard.call({ siteId })

        if (disposed) return
        state.value = reducePublicDashboard(state.value, { kind: 'access-revoked' })
      } else {
        const config =
          command.operation === 'enable'
            ? await orpc.publicDashboard.enablePublicDashboard.call({ siteId })
            : await orpc.publicDashboard.rotatePublicDashboardIdentifier.call({ siteId })

        if (disposed) return
        state.value = reducePublicDashboard(state.value, {
          kind: 'identifier-issued',
          operation: command.operation,
          config,
        })
      }
    } catch (error: unknown) {
      if (disposed) return
      state.value = reducePublicDashboard(state.value, {
        kind: 'operation-failed',
        operation: command.operation,
        error: normalizePublicDashboardError(error, 'operation'),
      })

      return
    }

    const reconciled = await readConfig('reconcile')

    if (disposed) return

    if (reconciled.kind === 'failed') {
      state.value = reducePublicDashboard(state.value, {
        kind: 'notice-warning',
        error: reconciled.error,
      })
    }
  }

  async function readConfig(intent: ReadIntent): Promise<ReadOutcome> {
    const version = ++requestVersion
    const siteId = requireSiteId()

    if (siteId === null) {
      state.value = reducePublicDashboard(state.value, {
        kind: 'config-failed',
        error: INVALID_SITE_ID_FAILURE,
      })

      return { kind: 'failed', error: INVALID_SITE_ID_FAILURE }
    }

    if (intent === 'refresh') {
      state.value = reducePublicDashboard(state.value, { kind: 'refresh-started' })
    }

    try {
      const config = await orpc.publicDashboard.getPublicDashboardConfig.call({ siteId })

      if (disposed || version !== requestVersion) {
        return { kind: 'failed', error: normalizePublicDashboardError({}, 'read') }
      }

      state.value = reducePublicDashboard(state.value, { kind: 'config-received', config })

      return { kind: 'settled' }
    } catch (error: unknown) {
      const failure = normalizePublicDashboardError(error, 'read')

      if (disposed || version !== requestVersion) return { kind: 'failed', error: failure }

      // NOT_FOUND means either "no stored dashboard" or "Site not served".
      // A first enable is only reachable through this branch, so it wins.
      if (failure.kind === 'not-found') {
        state.value = reducePublicDashboard(state.value, { kind: 'config-absent' })

        return { kind: 'settled' }
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
    () => void readConfig('refresh'),
  )

  if (getCurrentInstance() !== null) onMounted(() => void readConfig('refresh'))

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
  })

  return { view, refresh, request, cancel, confirm }
}
