import { computed, getCurrentInstance, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useOrpc } from '@/composables/useOrpc'
import { createInitialRetentionState, reduceRetention } from './retention-policy.reducer'
import type {
  Installation,
  InstallationRetentionResult,
  RetentionController,
  RetentionFailure,
  RetentionField,
  RetentionPolicy,
  RetentionProposal,
  RetentionResult,
  RetentionState,
} from './retention-policy.types'
import {
  deriveRetentionLock,
  isRetentionShortening,
  normalizeRetentionError,
  proposedPolicy,
  retentionShorteningImpact,
  toRetentionAdminView,
} from './retention-policy.utils'

type FreshRead = {
  readonly retention: InstallationRetentionResult | null
  readonly installation: Installation | null
  readonly retentionError: RetentionFailure | null
  readonly installationError: RetentionFailure | null
}

type RetentionBaseline = Pick<InstallationRetentionResult, 'updatedAt' | 'installationDefault'>

const STALE_CONFIRMATION_FAILURE: RetentionFailure = {
  kind: 'stale-confirmation',
  code: 'STALE_CONFIRMATION',
  httpStatus: undefined,
  message: 'Retention settings changed while you were reviewing them. Refresh and review again.',
  action: 'refresh',
}

export function useRetentionAdmin(): RetentionController {
  const orpc = useOrpc()
  const state = shallowRef<RetentionState>(createInitialRetentionState())
  const view = computed(() => toRetentionAdminView(state.value))
  let requestVersion = 0
  let disposed = false

  async function refresh(): Promise<void> {
    await readResources()
  }

  function edit(field: RetentionField, value: string): void {
    state.value = reduceRetention(state.value, { kind: 'field-edited', field, value })
  }

  async function submit(policy: RetentionPolicy): Promise<void> {
    const current = getLoadedState()
    if (current === null || !canSubmit(policy)) return

    const proposal: RetentionProposal = { kind: 'policy', policy }
    const shortening = isRetentionShortening(current.result.installationDefault, policy)
    if (shortening) {
      state.value = reduceRetention(state.value, {
        kind: 'save-requested',
        proposal,
        impact: retentionShorteningImpact(current.result.installationDefault, policy),
      })
      return
    }

    await commit(proposal, false, {
      updatedAt: current.result.updatedAt,
      installationDefault: current.result.installationDefault,
    })
  }

  function cancelConfirmation(): void {
    if (state.value.command.kind === 'submitting') return
    state.value = reduceRetention(state.value, { kind: 'save-cancelled' })
  }

  async function confirmShortening(confirmation: string): Promise<void> {
    const command = state.value.command
    if (command.kind !== 'confirming') return
    state.value = reduceRetention(state.value, {
      kind: 'confirmation-edited',
      value: confirmation,
    })
    const accepted = state.value.command
    if (accepted.kind !== 'confirming' || accepted.acknowledgement.kind !== 'accepted') return
    const baseline: RetentionBaseline = {
      updatedAt: command.baselineUpdatedAt,
      installationDefault: command.current,
    }
    await commit(accepted.proposal, true, baseline)
  }

  async function commit(
    proposal: RetentionProposal,
    shortening: boolean,
    baseline: RetentionBaseline,
  ): Promise<void> {
    state.value = reduceRetention(state.value, {
      kind: 'save-started',
      baselineUpdatedAt: baseline.updatedAt,
      proposal,
      shortening,
    })
    const fresh = await readResources()
    if (fresh.retention === null || fresh.installation === null) {
      const error =
        fresh.retentionError ??
        fresh.installationError ??
        normalizeRetentionError({}, 'status', 'installation')
      fail(proposal, shortening, error)
      return
    }

    if (
      fresh.retention.updatedAt !== baseline.updatedAt ||
      !samePolicy(fresh.retention.installationDefault, baseline.installationDefault)
    ) {
      fail(proposal, shortening, STALE_CONFIRMATION_FAILURE)
      return
    }

    const lock = deriveRetentionLock({
      kind: 'ready',
      installation: fresh.installation,
      refreshing: false,
    })
    if (lock.kind !== 'available') {
      fail(
        proposal,
        shortening,
        lockFailure(lock.kind === 'held' || lock.kind === 'cleanup-pending'),
      )
      return
    }

    try {
      const response = await orpc.retentionPolicy.updateRetentionPolicy.call({
        scope: 'installation',
        policy: proposedPolicy(proposal),
      })
      if (response.scope !== 'installation') {
        fail(
          proposal,
          shortening,
          normalizeRetentionError({ code: 'INTERNAL_SERVER_ERROR' }, 'update', 'installation'),
        )
        return
      }
      state.value = reduceRetention(state.value, { kind: 'save-succeeded', result: response })
    } catch (error: unknown) {
      fail(proposal, shortening, normalizeRetentionError(error, 'update', 'installation'))
    }
  }

  function fail(proposal: RetentionProposal, shortening: boolean, error: RetentionFailure): void {
    state.value = reduceRetention(state.value, {
      kind: 'save-failed',
      proposal,
      shortening,
      error,
    })
  }

  async function readResources(): Promise<FreshRead> {
    const version = ++requestVersion
    state.value = reduceRetention(state.value, { kind: 'refresh-started' })
    const [retentionResult, installationResult] = await Promise.allSettled([
      orpc.retentionPolicy.getRetentionPolicy.call({ scope: 'installation' }),
      orpc.installation.getInstallationStatus.call({}),
    ])
    if (disposed || version !== requestVersion) {
      return {
        retention: null,
        installation: null,
        retentionError: normalizeRetentionError({}, 'read', 'installation'),
        installationError: normalizeRetentionError({}, 'status', 'installation'),
      }
    }

    const retention = resolveRetentionResult(retentionResult)
    const installation = resolveInstallationResult(installationResult)
    if (retention.result !== null) {
      state.value = reduceRetention(state.value, {
        kind: 'retention-received',
        result: retention.result,
      })
    } else {
      state.value = reduceRetention(state.value, {
        kind: 'retention-failed',
        error: retention.error,
      })
    }
    if (installation.result !== null) {
      state.value = reduceRetention(state.value, {
        kind: 'installation-received',
        installation: installation.result,
      })
    } else {
      state.value = reduceRetention(state.value, {
        kind: 'installation-failed',
        error: installation.error,
      })
    }
    return {
      retention: retention.result,
      installation: installation.result,
      retentionError: retention.result === null ? retention.error : null,
      installationError: installation.result === null ? installation.error : null,
    }
  }

  function getLoadedState(): Extract<RetentionState['retention'], { kind: 'ready' }> | null {
    if (state.value.retention.kind !== 'ready' || state.value.retention.refreshing) return null
    return state.value.retention
  }

  function canSubmit(policy: RetentionPolicy): boolean {
    const current = view.value
    return (
      (current.kind === 'ready' && current.policy.canSubmit) ||
      (current.kind === 'ready' &&
        !current.stale &&
        current.lock.kind === 'available' &&
        current.command.kind === 'idle' &&
        !samePolicy(current.result.installationDefault, policy))
    )
  }

  if (getCurrentInstance() !== null) onMounted(() => void refresh())

  onScopeDispose(() => {
    disposed = true
    requestVersion += 1
  })

  return { view, refresh, edit, submit, cancelConfirmation, confirmShortening }
}

function resolveRetentionResult(result: PromiseSettledResult<RetentionResult>): {
  readonly result: InstallationRetentionResult | null
  readonly error: RetentionFailure
} {
  if (result.status === 'rejected')
    return { result: null, error: normalizeRetentionError(result.reason, 'read', 'installation') }
  if (result.value.scope === 'installation')
    return { result: result.value, error: normalizeRetentionError({}, 'read', 'installation') }
  return {
    result: null,
    error: normalizeRetentionError({ code: 'INTERNAL_SERVER_ERROR' }, 'read', 'installation'),
  }
}

function resolveInstallationResult(result: PromiseSettledResult<Installation>): {
  readonly result: Installation | null
  readonly error: RetentionFailure
} {
  if (result.status === 'fulfilled')
    return { result: result.value, error: normalizeRetentionError({}, 'status', 'installation') }
  return {
    result: null,
    error: normalizeRetentionError(result.reason, 'status', 'installation'),
  }
}

function samePolicy(left: RetentionPolicy, right: RetentionPolicy): boolean {
  return (
    left.eventMonths === right.eventMonths &&
    left.profileMonths === right.profileMonths &&
    left.replayMonths === right.replayMonths
  )
}

function lockFailure(held: boolean): RetentionFailure {
  return held
    ? normalizeRetentionError({ code: 'CONFLICT' }, 'update', 'installation')
    : normalizeRetentionError({}, 'status', 'installation')
}
