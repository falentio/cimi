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
import type { CimiOrpc } from '~/plugins/orpc'
import type {
  RetentionFailure,
  RetentionField,
  RetentionPolicy,
  RetentionProposal,
  SiteRetentionClient,
} from './retention-policy.types'
import {
  isRetentionShortening,
  normalizeRetentionError,
  proposedPolicy,
  retentionShorteningImpact,
} from './retention-policy.utils'
import {
  createInitialSiteRetentionState,
  reduceSiteRetention,
  siteRetentionBaseline,
} from './site-retention.reducer'
import type {
  SiteRetentionBaseline,
  SiteRetentionController,
  SiteRetentionOptions,
  SiteRetentionResult,
  SiteRetentionState,
} from './site-retention.types'
import { toSiteRetentionView } from './site-retention.utils'

type SiteRetentionGetCall = CimiOrpc['retentionPolicy']['getRetentionPolicy']['call']

type SiteRetentionGetInput = Extract<Parameters<SiteRetentionGetCall>[0], { scope: 'site' }>

type SiteRetentionUpdateCall = CimiOrpc['retentionPolicy']['updateRetentionPolicy']['call']

type SiteRetentionRead =
  | { readonly result: SiteRetentionResult; readonly error: null }
  | { readonly result: null; readonly error: RetentionFailure }

const STALE_CONFIRMATION_FAILURE: RetentionFailure = {
  kind: 'stale-confirmation',
  code: 'STALE_CONFIRMATION',
  httpStatus: undefined,
  message:
    'Site retention settings changed while you were reviewing them. Refresh and review again.',
  action: 'refresh',
}

export function useSiteRetention(options: SiteRetentionOptions): SiteRetentionController {
  const orpc: SiteRetentionClient = options.client ?? useOrpc()
  const siteId = computed(() => toValue(options.siteId))
  const state = shallowRef<SiteRetentionState>(createInitialSiteRetentionState())
  const view = computed(() => toSiteRetentionView(state.value))
  let requestVersion = 0
  let disposed = false

  async function refresh(): Promise<void> {
    await readRetention()
  }

  function edit(field: RetentionField, value: string): void {
    state.value = reduceSiteRetention(state.value, { kind: 'field-edited', field, value })
  }

  async function submit(policy: RetentionPolicy): Promise<void> {
    const loaded = getLoadedState()

    if (loaded === null || !canSubmit(policy)) return

    const proposal: RetentionProposal = { kind: 'policy', policy }

    if (isRetentionShortening(loaded.result.effectivePolicy, policy)) {
      state.value = reduceSiteRetention(state.value, {
        kind: 'save-requested',
        proposal,
        impact: retentionShorteningImpact(loaded.result.effectivePolicy, policy),
      })

      return
    }

    await commit(proposal, false, siteRetentionBaseline(loaded.result))
  }

  async function clear(): Promise<void> {
    const loaded = getLoadedState()

    if (loaded === null || loaded.result.siteOverride === null) return
    const installationDefault = loaded.result.installationDefault
    const proposal: RetentionProposal = { kind: 'inherit', installationDefault }

    if (isRetentionShortening(loaded.result.effectivePolicy, installationDefault)) {
      state.value = reduceSiteRetention(state.value, {
        kind: 'save-requested',
        proposal,
        impact: retentionShorteningImpact(loaded.result.effectivePolicy, installationDefault),
      })

      return
    }

    await commit(proposal, false, siteRetentionBaseline(loaded.result))
  }

  function cancelConfirmation(): void {
    if (state.value.command.kind === 'submitting') return
    state.value = reduceSiteRetention(state.value, { kind: 'save-cancelled' })
  }

  async function confirmShortening(confirmation: string): Promise<void> {
    const command = state.value.command

    if (command.kind !== 'confirming') return
    state.value = reduceSiteRetention(state.value, {
      kind: 'confirmation-edited',
      value: confirmation,
    })
    const accepted = state.value.command

    if (accepted.kind !== 'confirming' || accepted.acknowledgement.kind !== 'accepted') return
    await commit(accepted.proposal, true, command.baseline)
  }

  async function commit(
    proposal: RetentionProposal,
    shortening: boolean,
    baseline: SiteRetentionBaseline,
  ): Promise<void> {
    if (siteId.value === undefined) return
    state.value = reduceSiteRetention(state.value, {
      kind: 'save-started',
      baseline,
      proposal,
      shortening,
    })

    const fresh = await readRetention()

    if (fresh.result === null) {
      fail(proposal, shortening, fresh.error)

      return
    }

    if (!matchesBaseline(fresh.result, baseline)) {
      fail(proposal, shortening, STALE_CONFIRMATION_FAILURE)

      return
    }

    try {
      const response = await updatePolicy(proposal)

      if (response === null) {
        fail(
          proposal,
          shortening,
          normalizeRetentionError({ code: 'INTERNAL_SERVER_ERROR' }, 'update', 'site'),
        )

        return
      }

      state.value = reduceSiteRetention(state.value, {
        kind: 'save-succeeded',
        result: response,
        proposal,
      })
    } catch (error: unknown) {
      fail(proposal, shortening, normalizeRetentionError(error, 'update', 'site'))
    }
  }

  function fail(proposal: RetentionProposal, shortening: boolean, error: RetentionFailure): void {
    state.value = reduceSiteRetention(state.value, {
      kind: 'save-failed',
      proposal,
      shortening,
      error,
    })
  }

  async function updatePolicy(proposal: RetentionProposal): Promise<SiteRetentionResult | null> {
    const requestSiteId = siteId.value

    if (requestSiteId === undefined) return null

    const input: Parameters<SiteRetentionUpdateCall>[0] =
      proposal.kind === 'inherit'
        ? { scope: 'site', siteId: requestSiteId, policy: null }
        : { scope: 'site', siteId: requestSiteId, policy: proposedPolicy(proposal) }

    const response = await orpc.retentionPolicy.updateRetentionPolicy.call(input)

    return response.scope === 'site' ? response : null
  }

  async function readRetention(): Promise<SiteRetentionRead> {
    const requestSiteId = siteId.value

    if (requestSiteId === undefined) {
      return { result: null, error: normalizeRetentionError({ code: 'NOT_FOUND' }, 'read', 'site') }
    }

    const version = ++requestVersion
    state.value = reduceSiteRetention(state.value, { kind: 'refresh-started' })
    const input: SiteRetentionGetInput = { scope: 'site', siteId: requestSiteId }

    let result: SiteRetentionResult

    try {
      const response = await orpc.retentionPolicy.getRetentionPolicy.call(input)

      if (response.scope !== 'site') {
        return discardStaleRead(version, 'read', { code: 'INTERNAL_SERVER_ERROR' })
      }

      result = response
    } catch (error: unknown) {
      return discardStaleRead(version, 'read', error)
    }

    if (disposed || version !== requestVersion) {
      return { result: null, error: normalizeRetentionError({}, 'read', 'site') }
    }

    state.value = reduceSiteRetention(state.value, { kind: 'retention-received', result })

    return { result, error: null }
  }

  function discardStaleRead(
    version: number,
    source: 'read' | 'update',
    cause: unknown,
  ): SiteRetentionRead {
    const failure = normalizeRetentionError(cause, source, 'site')

    if (disposed || version !== requestVersion) return { result: null, error: failure }
    state.value = reduceSiteRetention(state.value, { kind: 'retention-failed', error: failure })

    return { result: null, error: failure }
  }

  function getLoadedState(): Extract<SiteRetentionState['retention'], { kind: 'ready' }> | null {
    if (state.value.retention.kind !== 'ready' || state.value.retention.refreshing) return null

    return state.value.retention
  }

  function canSubmit(policy: RetentionPolicy): boolean {
    const current = view.value

    if (current.kind !== 'ready' || current.stale) return false

    if (current.command.kind !== 'idle') return false

    return current.policy.canSubmit || !samePolicy(current.result.effectivePolicy, policy)
  }

  watch(siteId, () => void refresh())

  if (getCurrentInstance() !== null) onMounted(() => void refresh())

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
  })

  return { view, refresh, edit, submit, clear, cancelConfirmation, confirmShortening }
}

function matchesBaseline(result: SiteRetentionResult, baseline: SiteRetentionBaseline): boolean {
  return (
    result.updatedAt === baseline.updatedAt &&
    samePolicy(result.effectivePolicy, baseline.effectivePolicy) &&
    samePolicy(result.installationDefault, baseline.installationDefault)
  )
}

function samePolicy(left: RetentionPolicy, right: RetentionPolicy): boolean {
  return (
    left.eventMonths === right.eventMonths &&
    left.profileMonths === right.profileMonths &&
    left.replayMonths === right.replayMonths
  )
}
