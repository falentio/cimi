import { useMutation, useQuery } from '@pinia/colada'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useOrpc } from '@/composables/useOrpc'
import {
  canStartUpgrade,
  deriveSetupView,
  isExactUpgradeConfirmation,
  mapInitializeResponse,
  mapSetupError,
  toHealthResource,
  toInstallationResource,
} from './setup.utils'
import type {
  InitializationOutcome,
  InitializationView,
  PollingView,
  SetupController,
  SetupNotice,
  SetupOperation,
  SetupViewModel,
  UpgradeView,
} from './setup.types'
import { MAX_POLL_ATTEMPTS } from './setup.types'

const POLL_INTERVAL_MS = 1_500

export function useSetup(): SetupController {
  const orpc = useOrpc()
  const installationQuery = useQuery({
    ...orpc.installation.getInstallationStatus.queryOptions({ input: {} }),
    enabled: import.meta.client,
  })
  const healthQuery = useQuery({
    ...orpc.health.health.queryOptions(),
    enabled: import.meta.client,
  })
  const initializeMutation = useMutation(orpc.installation.initializeInstallation.mutationOptions())
  const upgradeMutation = useMutation(orpc.installation.upgradeInstallation.mutationOptions())

  const initialization = shallowRef<InitializationView>({ kind: 'available' })
  const upgrade = shallowRef<UpgradeView>({ kind: 'available' })
  const polling = shallowRef<PollingView>({ kind: 'idle' })
  const notice = shallowRef<SetupNotice | undefined>(undefined)
  const pollingOperationId = shallowRef<string | undefined>(undefined)
  let pollGeneration = 0
  let disposed = false
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let resolvePollTimer: ((value: boolean) => void) | undefined

  const view = computed<SetupViewModel>(() =>
    deriveSetupView({
      installation: toInstallationResource({
        data: installationQuery.data.value,
        error: installationQuery.error.value,
        isLoading: installationQuery.isLoading.value,
      }),
      health: toHealthResource({
        data: healthQuery.data.value,
        error: healthQuery.error.value,
        isLoading: healthQuery.isLoading.value,
      }),
      initialization: initialization.value,
      upgrade: upgrade.value,
      polling: polling.value,
      notice: notice.value,
    }),
  )

  async function refresh(): Promise<void> {
    const results = await Promise.allSettled([installationQuery.refetch(), healthQuery.refetch()])
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (failure !== undefined) throw failure.reason
    if (pollingOperationId.value === undefined && upgrade.value.kind === 'failure') {
      upgrade.value = { kind: 'available' }
    }
  }

  async function initialize(): Promise<InitializationOutcome> {
    initializeMutation.reset()
    initialization.value = { kind: 'submitting' }
    try {
      const response = await initializeMutation.mutateAsync({})
      const outcome = mapInitializeResponse(response)
      initialization.value = { kind: 'success', outcome }
      notice.value =
        outcome.kind === 'created'
          ? {
              kind: 'initialized',
              httpStatus: 201,
              message: 'Installation initialized.',
            }
          : {
              kind: 'reused',
              httpStatus: 200,
              message: 'Existing installation reused; no data was overwritten.',
            }
      await refresh().catch(() => undefined)
      return outcome
    } catch (error: unknown) {
      const failure = mapSetupError(error, 'initialize')
      initialization.value = { kind: 'failure', error: failure }
      throw error
    }
  }

  function beginUpgrade(): void {
    const current = view.value
    if (current.kind !== 'operational') return
    if (!canStartUpgrade(current.installation.installation, current.lifecycle)) return
    upgrade.value = { kind: 'confirming' }
  }

  function cancelUpgrade(): void {
    if (upgrade.value.kind === 'submitting' || upgrade.value.kind === 'polling') return
    upgrade.value = { kind: 'available' }
  }

  async function submitUpgrade(confirmation: string): Promise<void> {
    if (!isExactUpgradeConfirmation(confirmation)) {
      upgrade.value = {
        kind: 'confirmation-required',
        error: {
          kind: 'confirmation-required',
          message: 'Type UPGRADE exactly to start an installation upgrade.',
          action: 'edit-confirmation',
        },
      }
      return
    }

    const current = view.value
    if (current.kind !== 'operational') return
    if (!canStartUpgrade(current.installation.installation, current.lifecycle)) return

    upgradeMutation.reset()
    upgrade.value = { kind: 'submitting' }
    try {
      const installation = await upgradeMutation.mutateAsync({ confirmation: 'UPGRADE' })
      const operation = installation.activeOperation
      if (operation === null || operation.errorCode !== null) {
        await refresh().catch(() => undefined)
        upgrade.value =
          operation === null
            ? { kind: 'completed' }
            : { kind: 'failure', error: mapSetupError({ code: operation.errorCode }, 'upgrade') }
        return
      }
      startPolling(operation)
    } catch (error: unknown) {
      upgrade.value = { kind: 'failure', error: mapSetupError(error, 'upgrade') }
      throw error
    }
  }

  function startPolling(operation: SetupOperation): void {
    if (disposed) return
    const existingOperationId = pollingOperationId.value
    if (existingOperationId !== undefined) {
      if (existingOperationId === operation.operationId) return
      stopPollingWithFailure()
      return
    }

    pollingOperationId.value = operation.operationId
    polling.value = { kind: 'active', attempt: 0, maxAttempts: MAX_POLL_ATTEMPTS }
    upgrade.value = { kind: 'polling' }
    const generation = ++pollGeneration
    void pollOperation(operation.operationId, generation)
  }

  async function pollOperation(operationId: string, generation: number): Promise<void> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      if (!isCurrentPoll(operationId, generation)) return
      if (attempt > 1 && !(await waitForPoll())) return
      polling.value = { kind: 'active', attempt, maxAttempts: MAX_POLL_ATTEMPTS }
      const statusError = await refreshForPoll()
      if (!isCurrentPoll(operationId, generation)) return
      if (statusError !== undefined) {
        finishPolling({ kind: 'failure', error: mapSetupError(statusError, 'upgrade') })
        return
      }

      const currentOperation = installationQuery.data.value?.activeOperation ?? null
      if (currentOperation === null) {
        finishPolling({ kind: 'completed' })
        return
      }
      if (currentOperation.operationId !== operationId) {
        stopPollingWithFailure()
        return
      }
      if (currentOperation.errorCode !== null) {
        finishPolling({
          kind: 'failure',
          error: mapSetupError({ code: currentOperation.errorCode }, 'upgrade'),
        })
        return
      }
    }

    if (!isCurrentPoll(operationId, generation)) return
    polling.value = {
      kind: 'exhausted',
      attempts: MAX_POLL_ATTEMPTS,
      maxAttempts: MAX_POLL_ATTEMPTS,
    }
    pollingOperationId.value = undefined
    upgrade.value = {
      kind: 'failure',
      error: mapSetupError({ code: 'UPGRADE_TIMEOUT' }, 'upgrade'),
    }
  }

  async function refreshForPoll(): Promise<unknown> {
    let statusError: unknown
    try {
      await installationQuery.refetch()
    } catch (error: unknown) {
      statusError = error
    }
    await healthQuery.refetch().catch(() => undefined)
    return statusError
  }

  function finishPolling(nextUpgrade: UpgradeView): void {
    pollingOperationId.value = undefined
    polling.value = { kind: 'idle' }
    upgrade.value = nextUpgrade
  }

  function stopPollingWithFailure(): void {
    pollGeneration += 1
    pollingOperationId.value = undefined
    polling.value = { kind: 'idle' }
    upgrade.value = {
      kind: 'failure',
      error: mapSetupError({ code: 'CONFLICT', status: 409 }, 'upgrade'),
    }
  }

  function isCurrentPoll(operationId: string, generation: number): boolean {
    return !disposed && generation === pollGeneration && pollingOperationId.value === operationId
  }

  function waitForPoll(): Promise<boolean> {
    return new Promise((resolve) => {
      resolvePollTimer = resolve
      pollTimer = setTimeout(() => {
        pollTimer = undefined
        resolvePollTimer = undefined
        resolve(!disposed)
      }, POLL_INTERVAL_MS)
    })
  }

  watch(
    () => {
      const operation = installationQuery.data.value?.activeOperation
      return operation === null || operation === undefined
        ? undefined
        : { operationId: operation.operationId, terminal: operation.errorCode !== null }
    },
    (operation) => {
      if (operation === undefined || operation.terminal) return
      if (pollingOperationId.value === undefined) {
        const current = installationQuery.data.value?.activeOperation
        if (current?.kind === 'upgrade') startPolling(current)
        return
      }
      if (pollingOperationId.value !== operation.operationId) stopPollingWithFailure()
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    disposed = true
    pollGeneration += 1
    pollingOperationId.value = undefined
    if (pollTimer !== undefined) clearTimeout(pollTimer)
    pollTimer = undefined
    resolvePollTimer?.(false)
    resolvePollTimer = undefined
  })

  return { view, refresh, initialize, beginUpgrade, cancelUpgrade, submitUpgrade }
}
