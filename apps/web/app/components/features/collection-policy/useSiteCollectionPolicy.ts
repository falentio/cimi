import {
  computed,
  getCurrentInstance,
  onMounted,
  onScopeDispose,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { useOrpc } from '@/composables/useOrpc'
import {
  createInitialCollectionPolicyState,
  reduceCollectionPolicy,
} from './collection-policy.reducer'
import type {
  CollectionFieldPatch,
  CollectionPolicyFailure,
  CollectionPolicyResult,
  CollectionPolicyState,
  CollectionPolicyUpdateInput,
  PolicyValues,
  SiteCollectionPolicyController,
  SiteCollectionPolicyOptions,
} from './collection-policy.types'
import {
  normalizeCollectionPolicyError,
  toCollectionPolicyView,
  toPolicyValues,
} from './collection-policy.utils'

type ReadOutcome = {
  readonly result: CollectionPolicyResult | null
  readonly error: CollectionPolicyFailure | null
}

const INVALID_SITE_ID_FAILURE: CollectionPolicyFailure = {
  kind: 'not-found',
  code: 'NOT_FOUND',
  httpStatus: 404,
  message: 'This Site is not available. Refresh or choose another Site.',
  action: 'refresh',
}

export function useSiteCollectionPolicy(
  options: SiteCollectionPolicyOptions,
): SiteCollectionPolicyController {
  const orpc = useOrpc()
  const state = shallowRef<CollectionPolicyState>(createInitialCollectionPolicyState())
  const view = computed(() => toCollectionPolicyView(state.value))
  let requestVersion = 0
  let disposed = false

  async function refresh(): Promise<void> {
    await readPolicy()
  }

  function beginEdit(): void {
    state.value = reduceCollectionPolicy(state.value, { kind: 'edit-begun' })
  }

  function cancelEdit(): void {
    state.value = reduceCollectionPolicy(state.value, { kind: 'edit-cancelled' })
  }

  function edit(patch: CollectionFieldPatch): void {
    state.value = reduceCollectionPolicy(state.value, { kind: 'field-edited', patch })
  }

  async function save(): Promise<void> {
    const current = view.value

    if (current.kind !== 'ready' || !current.editor.canSubmit) return
    const validation = toPolicyValues(current.editor.draft)

    if (validation.kind === 'invalid') return
    await commit('save', validation.values)
  }

  async function clearOverride(): Promise<void> {
    const current = view.value

    if (current.kind !== 'ready' || !current.editor.canClear) return
    await commit('clear', null)
  }

  async function commit(operation: 'save' | 'clear', values: PolicyValues | null): Promise<void> {
    const siteId = requireSiteId()

    if (siteId === null) {
      fail(operation, INVALID_SITE_ID_FAILURE)

      return
    }

    state.value = reduceCollectionPolicy(state.value, { kind: 'submit-started', operation })

    try {
      const response = await callUpdate(siteId, operation, values)

      if (disposed) return

      if (response === null) {
        fail(operation, normalizeCollectionPolicyError({}, 'update'))

        return
      }

      state.value = reduceCollectionPolicy(state.value, {
        kind: 'submit-succeeded',
        operation,
        layer: response,
      })
    } catch (error: unknown) {
      if (disposed) return
      fail(operation, normalizeCollectionPolicyError(error, 'update'))

      return
    }

    // A silent read so the committed notice survives the provenance refresh.
    const confirmed = await readPolicy({ silent: true })

    if (disposed) return

    if (confirmed.error !== null) {
      state.value = reduceCollectionPolicy(state.value, {
        kind: 'refresh-warning',
        error: confirmed.error,
      })
    }
  }

  async function callUpdate(
    siteId: string,
    operation: 'save' | 'clear',
    values: PolicyValues | null,
  ): Promise<PolicyValues | null> {
    const input: CollectionPolicyUpdateInput =
      operation === 'clear' || values === null
        ? { scope: 'site', policy: { siteId, clear: true } }
        : { scope: 'site', policy: { siteId, ...values } }

    const response = await orpc.collectionPolicy.updateCollectionPolicy.call(input)

    if (response.scope !== 'site') return null
    const { scope: _scope, siteId: _siteId, ...layer } = response

    return layer
  }

  function fail(operation: 'save' | 'clear', error: CollectionPolicyFailure): void {
    state.value = reduceCollectionPolicy(state.value, {
      kind: 'submit-failed',
      operation,
      error,
    })
  }

  async function readPolicy(options: { silent?: boolean } = {}): Promise<ReadOutcome> {
    const version = ++requestVersion
    const siteId = requireSiteId()

    if (siteId === null) {
      state.value = reduceCollectionPolicy(state.value, {
        kind: 'policy-failed',
        error: INVALID_SITE_ID_FAILURE,
      })

      return { result: null, error: INVALID_SITE_ID_FAILURE }
    }

    if (options.silent !== true) {
      state.value = reduceCollectionPolicy(state.value, { kind: 'refresh-started' })
    }

    try {
      const result = await orpc.collectionPolicy.getCollectionPolicy.call({ siteId })

      if (disposed || version !== requestVersion) {
        return { result: null, error: normalizeCollectionPolicyError({}, 'read') }
      }

      state.value = reduceCollectionPolicy(state.value, { kind: 'policy-received', result })

      return { result, error: null }
    } catch (error: unknown) {
      const failure = normalizeCollectionPolicyError(error, 'read')

      if (disposed || version !== requestVersion) return { result: null, error: failure }
      state.value = reduceCollectionPolicy(state.value, { kind: 'policy-failed', error: failure })

      return { result: null, error: failure }
    }
  }

  function requireSiteId(): string | null {
    const siteId = toValue(options.siteId)

    return typeof siteId === 'string' && siteId.trim() !== '' ? siteId : null
  }

  watch(
    () => toValue(options.siteId),
    () => void readPolicy(),
  )

  if (getCurrentInstance() !== null) onMounted(() => void readPolicy())

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
  })

  return { view, refresh, beginEdit, cancelEdit, edit, save, clearOverride }
}
