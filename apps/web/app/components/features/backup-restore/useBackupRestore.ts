import { computed, getCurrentInstance, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useOrpc } from '@/composables/useOrpc'
import { createInitialBackupRestoreData, reduceBackupRestoreData } from './backup-restore.reducer'
import type {
  Backup,
  BackupId,
  BackupRestoreController,
  BackupRestoreDataState,
  CommandState,
  Installation,
  InstallationSignal,
  ListSignal,
  PollingState,
  RestoreDialogState,
} from './backup-restore.types'
import {
  deriveBackupRestoreActions,
  deriveLifecycleLock,
  isExactRestoreConfirmation,
  isRestorableSource,
  normalizeBackupRestoreError,
  toBackupRestoreViewModel,
} from './backup-restore.utils'

const PAGE_SIZE = 20
const POLL_INTERVAL_MS = 1_500
const MAX_POLL_ATTEMPTS = 20

export function useBackupRestore(): BackupRestoreController {
  const orpc = useOrpc()
  const data = shallowRef<BackupRestoreDataState>(createInitialBackupRestoreData())
  const list = shallowRef<ListSignal>({ kind: 'loading' })
  const installation = shallowRef<InstallationSignal>({ kind: 'loading' })
  const command = shallowRef<CommandState>({ kind: 'idle' })
  const polling = shallowRef<PollingState>({ kind: 'idle' })
  const restoreDialog = shallowRef<RestoreDialogState>({ kind: 'closed' })
  const pollingOperationId = shallowRef<BackupId | null>(null)
  const adoptedOperationIds = new Set<BackupId>()
  const adoptingOperationIds = new Set<BackupId>()
  let pollGeneration = 0
  let pollTimer: ReturnType<typeof setTimeout> | undefined
  let resolvePollTimer: ((value: boolean) => void) | undefined
  let disposed = false

  const view = computed(() =>
    toBackupRestoreViewModel({
      data: data.value,
      list: list.value,
      installation: installation.value,
      command: command.value,
      polling: polling.value,
      restoreDialog: restoreDialog.value,
    }),
  )

  async function refresh(): Promise<void> {
    beginListRefresh()
    beginInstallationRefresh()
    const [listResult, installationResult] = await Promise.allSettled([
      orpc.backupRestore.listBackups.call({ offset: 0, limit: PAGE_SIZE }),
      orpc.installation.getInstallationStatus.call({}),
    ])

    if (listResult.status === 'fulfilled') {
      data.value = reduceBackupRestoreData(data.value, {
        kind: 'list-replaced',
        page: listResult.value,
      })
      list.value = { kind: 'ready', refreshing: false, loadingMore: false }
    } else {
      list.value = {
        kind: 'failed',
        error: normalizeBackupRestoreError(listResult.reason, 'list'),
      }
    }

    if (installationResult.status === 'fulfilled') {
      installation.value = {
        kind: 'ready',
        installation: installationResult.value,
        refreshing: false,
      }
    } else {
      const previous = getInstallation(installation.value)
      installation.value =
        previous === null
          ? {
              kind: 'failed',
              error: normalizeBackupRestoreError(installationResult.reason, 'installation'),
            }
          : {
              kind: 'stale',
              installation: previous,
              error: normalizeBackupRestoreError(installationResult.reason, 'installation'),
            }
    }

    await adoptServerOperation()
  }

  async function loadMore(): Promise<void> {
    const offset = data.value.nextOffset
    if (offset === null || !data.value.hasMore || list.value.kind === 'loading') return
    list.value = {
      kind: 'ready',
      refreshing: list.value.kind === 'ready' && list.value.refreshing,
      loadingMore: true,
    }
    try {
      const page = await orpc.backupRestore.listBackups.call({ offset, limit: PAGE_SIZE })
      data.value = reduceBackupRestoreData(data.value, { kind: 'list-appended', page })
      list.value = { kind: 'ready', refreshing: false, loadingMore: false }
    } catch (error: unknown) {
      list.value = { kind: 'failed', error: normalizeBackupRestoreError(error, 'list') }
    }
  }

  function openRestore(backupId: BackupId): void {
    const current = view.value
    const backup = data.value.records.get(backupId)
    if (
      current.kind !== 'ready' ||
      !current.actions.canRestore ||
      backup === undefined ||
      !isRestorableSource(backup)
    ) {
      return
    }
    data.value = reduceBackupRestoreData(data.value, {
      kind: 'selection-changed',
      backupId,
    })
    restoreDialog.value = { kind: 'confirming', backupId, error: null }
  }

  function cancelRestore(): void {
    if (restoreDialog.value.kind === 'submitting') return
    restoreDialog.value = { kind: 'closed' }
    data.value = reduceBackupRestoreData(data.value, {
      kind: 'selection-changed',
      backupId: null,
    })
  }

  async function createBackup(): Promise<void> {
    const current = view.value
    if (current.kind !== 'ready' || !current.actions.canCreate) return
    const freshInstallation = await refreshInstallationForAdmission()
    if (freshInstallation === null || !canMutate(freshInstallation, data.value, 'create')) return

    command.value = { kind: 'creating' }
    try {
      const operation = await orpc.backupRestore.createBackup.call({})
      acceptedOperation(operation)
    } catch (error: unknown) {
      const failure = normalizeBackupRestoreError(error, 'create')
      command.value = { kind: 'failed', command: 'create', error: failure }
      await refresh()
    }
  }

  async function confirmRestore(confirmation: string): Promise<void> {
    const dialog = restoreDialog.value
    if (dialog.kind !== 'confirming') return
    if (!isExactRestoreConfirmation(confirmation)) {
      restoreDialog.value = {
        kind: 'confirming',
        backupId: dialog.backupId,
        error: normalizeBackupRestoreError({ code: 'BAD_REQUEST' }, 'restore'),
      }
      return
    }

    restoreDialog.value = { kind: 'submitting', backupId: dialog.backupId }
    command.value = { kind: 'restoring', sourceId: dialog.backupId }
    const freshInstallation = await refreshInstallationForAdmission()
    const backup = data.value.records.get(dialog.backupId)
    if (
      freshInstallation === null ||
      !canMutate(freshInstallation, data.value, 'restore') ||
      backup === undefined ||
      !isRestorableSource(backup)
    ) {
      command.value = { kind: 'idle' }
      restoreDialog.value = {
        kind: 'confirming',
        backupId: dialog.backupId,
        error: normalizeBackupRestoreError({ code: 'CONFLICT' }, 'restore'),
      }
      return
    }

    try {
      const operation = await orpc.backupRestore.restoreBackup.call({
        backupId: dialog.backupId,
        confirmation: 'RESTORE',
      })
      restoreDialog.value = {
        kind: 'tracking',
        backupId: dialog.backupId,
        operationId: operation.id,
      }
      acceptedOperation(operation)
    } catch (error: unknown) {
      const failure = normalizeBackupRestoreError(error, 'restore')
      command.value = { kind: 'failed', command: 'restore', error: failure }
      restoreDialog.value = { kind: 'confirming', backupId: dialog.backupId, error: failure }
      await refresh()
    }
  }

  function resumePolling(): void {
    const operationId =
      polling.value.kind === 'manual' ? polling.value.operationId : data.value.trackedOperation?.id
    if (operationId === undefined || operationId === null) return
    const operation = data.value.records.get(operationId)
    if (operation === undefined || !shouldContinuePolling(operation)) return
    const resumedAfterReload = polling.value.kind !== 'idle' && polling.value.resumedAfterReload
    startPolling(operationId, resumedAfterReload)
  }

  async function refreshInstallationForAdmission(): Promise<Installation | null> {
    try {
      const next = await orpc.installation.getInstallationStatus.call({})
      installation.value = { kind: 'ready', installation: next, refreshing: false }
      return next
    } catch (error: unknown) {
      const previous = getInstallation(installation.value)
      installation.value =
        previous === null
          ? { kind: 'failed', error: normalizeBackupRestoreError(error, 'installation') }
          : {
              kind: 'stale',
              installation: previous,
              error: normalizeBackupRestoreError(error, 'installation'),
            }
      return null
    }
  }

  function acceptedOperation(operation: Backup): void {
    adoptedOperationIds.add(operation.id)
    data.value = reduceBackupRestoreData(data.value, { kind: 'operation-received', operation })
    command.value = { kind: 'idle' }
    startPolling(operation.id, false)
  }

  async function adoptServerOperation(): Promise<void> {
    if (data.value.trackedOperation !== null && pollingOperationId.value !== null) return
    const installationRecord = getInstallation(installation.value)
    const installationOperation = installationRecord?.activeOperation
    const installationBackupOperation =
      installationOperation?.kind === 'backup' || installationOperation?.kind === 'restore'
        ? installationOperation.operationId
        : null
    const otherLifecycleOperationIsActive =
      installationOperation !== undefined &&
      installationOperation !== null &&
      installationOperation.errorCode === null &&
      installationBackupOperation === null
    if (otherLifecycleOperationIsActive) return
    const catalogOperation = data.value.order
      .map((id) => data.value.records.get(id))
      .find((operation) => operation !== undefined && shouldContinuePolling(operation))
    const operationId = installationBackupOperation ?? catalogOperation?.id ?? null
    if (
      operationId === null ||
      adoptedOperationIds.has(operationId) ||
      adoptingOperationIds.has(operationId)
    ) {
      return
    }
    adoptingOperationIds.add(operationId)

    try {
      const operation = await orpc.backupRestore.getBackupStatus.call({ backupId: operationId })
      if (disposed) return
      adoptedOperationIds.add(operationId)
      data.value = reduceBackupRestoreData(data.value, { kind: 'operation-received', operation })
      command.value = { kind: 'idle' }
      const currentOperation = data.value.records.get(operation.id) ?? operation
      if (shouldContinuePolling(currentOperation)) startPolling(currentOperation.id, true)
    } catch (error: unknown) {
      if (disposed) return
      list.value =
        list.value.kind === 'failed'
          ? list.value
          : { kind: 'failed', error: normalizeBackupRestoreError(error, 'status') }
    } finally {
      adoptingOperationIds.delete(operationId)
    }
  }

  function startPolling(operationId: BackupId, resumedAfterReload: boolean): void {
    if (disposed) return
    if (pollingOperationId.value === operationId && polling.value.kind === 'automatic') return
    cancelPollWait()
    const generation = ++pollGeneration
    pollingOperationId.value = operationId
    polling.value = {
      kind: 'automatic',
      operationId,
      attempt: 0,
      maxAttempts: MAX_POLL_ATTEMPTS,
      resumedAfterReload,
    }
    void pollOperation(operationId, generation, resumedAfterReload)
  }

  async function pollOperation(
    operationId: BackupId,
    generation: number,
    resumedAfterReload: boolean,
  ): Promise<void> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
      if (!isCurrentPoll(operationId, generation)) return
      const knownOperation = data.value.records.get(operationId)
      if (attempt > 1 && knownOperation !== undefined && !shouldContinuePolling(knownOperation)) {
        finishPolling(operationId, generation)
        await refresh()
        return
      }
      if (attempt > 1 && !(await waitForPoll())) return
      if (!isCurrentPoll(operationId, generation)) return
      polling.value = {
        kind: 'automatic',
        operationId,
        attempt,
        maxAttempts: MAX_POLL_ATTEMPTS,
        resumedAfterReload,
      }

      let operation: Backup
      try {
        operation = await orpc.backupRestore.getBackupStatus.call({ backupId: operationId })
      } catch {
        if (!isCurrentPoll(operationId, generation)) return
        polling.value = {
          kind: 'manual',
          operationId,
          reason: 'temporary-error',
          resumedAfterReload,
        }
        pausePolling(operationId)
        return
      }

      if (!isCurrentPoll(operationId, generation)) return
      data.value = reduceBackupRestoreData(data.value, { kind: 'operation-received', operation })
      command.value = { kind: 'idle' }
      await refreshInstallationForAdmission()
      if (!isCurrentPoll(operationId, generation)) return
      const currentOperation = data.value.records.get(operation.id) ?? operation
      if (!shouldContinuePolling(currentOperation)) {
        finishPolling(operationId, generation)
        await refresh()
        return
      }
    }

    if (!isCurrentPoll(operationId, generation)) return
    polling.value = {
      kind: 'manual',
      operationId,
      reason: 'poll-limit',
      resumedAfterReload,
    }
    pausePolling(operationId)
  }

  function finishPolling(operationId: BackupId, generation: number): void {
    if (!isCurrentPoll(operationId, generation)) return
    cancelPollWait()
    pollingOperationId.value = null
    polling.value = { kind: 'idle' }
    pollGeneration += 1
  }

  function pausePolling(operationId: BackupId): void {
    if (pollingOperationId.value !== operationId) return
    cancelPollWait()
    pollingOperationId.value = null
    pollGeneration += 1
    command.value = { kind: 'idle' }
  }

  function isCurrentPoll(operationId: BackupId, generation: number): boolean {
    return !disposed && pollingOperationId.value === operationId && pollGeneration === generation
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

  function cancelPollWait(): void {
    if (pollTimer !== undefined) clearTimeout(pollTimer)
    pollTimer = undefined
    const resolve = resolvePollTimer
    resolvePollTimer = undefined
    resolve?.(false)
  }

  function beginListRefresh(): void {
    list.value =
      data.value.order.length === 0
        ? { kind: 'loading' }
        : { kind: 'ready', refreshing: true, loadingMore: false }
  }

  function beginInstallationRefresh(): void {
    const current = getInstallation(installation.value)
    installation.value =
      current === null
        ? { kind: 'loading' }
        : { kind: 'ready', installation: current, refreshing: true }
  }

  function canMutate(
    nextInstallation: Installation,
    currentData: BackupRestoreDataState,
    kind: 'create' | 'restore',
  ): boolean {
    const lock = deriveLifecycleLock({
      installation: { kind: 'ready', installation: nextInstallation, refreshing: false },
    })
    const actions = deriveBackupRestoreActions({
      lock,
      command: { kind: 'idle' },
      trackedOperation: currentData.trackedOperation,
    })
    return kind === 'create' ? actions.canCreate : actions.canRestore
  }

  function shouldContinuePolling(operation: Backup): boolean {
    return (
      operation.status !== 'failed' &&
      !(operation.status === 'available' && !operation.cleanupPending)
    )
  }

  function getInstallation(signal: InstallationSignal): Installation | null {
    return signal.kind === 'ready' || signal.kind === 'stale' ? signal.installation : null
  }

  if (getCurrentInstance() !== null) {
    onMounted(() => {
      void refresh()
    })
  }

  onScopeDispose(() => {
    disposed = true
    pollGeneration += 1
    pollingOperationId.value = null
    cancelPollWait()
  })

  return {
    view,
    refresh,
    loadMore,
    openRestore,
    cancelRestore,
    createBackup,
    confirmRestore,
    resumePolling,
  }
}
