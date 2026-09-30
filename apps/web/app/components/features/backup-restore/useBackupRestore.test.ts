import { effectScope, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Backup, Installation } from './backup-restore.types'

const mocks = vi.hoisted(() => {
  const listBackups = vi.fn()
  const getBackupStatus = vi.fn()
  const createBackup = vi.fn()
  const restoreBackup = vi.fn()
  const getInstallationStatus = vi.fn()
  return {
    listBackups,
    getBackupStatus,
    createBackup,
    restoreBackup,
    getInstallationStatus,
    client: {
      backupRestore: {
        listBackups: { call: listBackups },
        getBackupStatus: { call: getBackupStatus },
        createBackup: { call: createBackup },
        restoreBackup: { call: restoreBackup },
      },
      installation: { getInstallationStatus: { call: getInstallationStatus } },
    },
  }
})

vi.mock('@/composables/useOrpc', () => ({ useOrpc: () => mocks.client }))

import { useBackupRestore } from './useBackupRestore'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const readyInstallation = {
  status: 'ready',
  defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  dataDirectoryReady: true,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: none,
  backupCleanup: none,
  updatedAt: '2026-09-18T10:00:00Z',
} satisfies Installation

function sourceBackup(id = 'backup-source'): Backup {
  return {
    id,
    status: 'available',
    createdAt: '2026-09-18T10:00:00Z',
    completedAt: '2026-09-18T10:02:00Z',
    scope: 'installation',
    phase: 'ready',
    progress: 1,
    checkpoint: 'structurally_ready',
    lastSafeSequence: 12,
    readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
    cleanupPending: false,
    derivedCleanup: none,
    backupCleanup: none,
    restoreSourceBackupId: null,
    preRestoreSafetyArtifact: null,
    errorCode: null,
  }
}

function creatingBackup(id: string): Backup {
  return {
    ...sourceBackup(id),
    status: 'creating',
    completedAt: null,
    phase: 'capturing_sqlite',
    progress: 0.2,
    checkpoint: 'none',
    lastSafeSequence: null,
    readiness: { controlStore: 'not_ready', analyticsStore: 'not_ready', structural: 'not_ready' },
  }
}

function failedBackup(id: string): Backup {
  return {
    ...sourceBackup(id),
    status: 'failed',
    phase: 'failed',
    errorCode: 'BACKUP_FAILED',
  }
}

function cleanupPendingBackup(id: string): Backup {
  return {
    ...sourceBackup(id),
    phase: 'cleanup_pending',
    cleanupPending: true,
    derivedCleanup: {
      status: 'pending',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
  }
}

function page(items: readonly Backup[]) {
  return { items: [...items], nextOffset: null, hasMore: false, totalCount: items.length }
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.listBackups.mockResolvedValue(page([]))
  mocks.getInstallationStatus.mockResolvedValue(readyInstallation)
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

function createController() {
  const scope = effectScope()
  let controller: ReturnType<typeof useBackupRestore> | undefined
  scope.run(() => {
    controller = useBackupRestore()
  })
  if (controller === undefined) throw new Error('Controller was not created.')
  return { controller, scope }
}

beforeEach(() => {
  resetMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useBackupRestore', () => {
  it('requires the exact RESTORE confirmation before calling the command', async () => {
    const source = sourceBackup()
    mocks.listBackups.mockResolvedValue(page([source]))
    const { controller, scope } = createController()
    await controller.refresh()
    controller.openRestore(source.id)

    await controller.confirmRestore('restore')

    expect(mocks.restoreBackup).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: { kind: 'confirming', error: { code: 'BAD_REQUEST' } },
    })
    scope.stop()
  })

  it('rechecks the lock, accepts a backup, and polls until available', async () => {
    const accepted = creatingBackup('backup-created')
    const complete = sourceBackup(accepted.id)
    mocks.createBackup.mockResolvedValue(accepted)
    mocks.getBackupStatus.mockResolvedValue(complete)
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.createBackup()
    await settle()

    expect(mocks.createBackup).toHaveBeenCalledWith({})
    expect(mocks.getInstallationStatus).toHaveBeenCalled()
    expect(mocks.getBackupStatus).toHaveBeenCalledWith({ backupId: accepted.id })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'available', operation: 'backup', operationId: accepted.id },
    })
    scope.stop()
  })

  it('resumes polling after a temporary status error for the same operation', async () => {
    const accepted = creatingBackup('backup-created')
    const complete = sourceBackup(accepted.id)
    mocks.createBackup.mockResolvedValue(accepted)
    mocks.getBackupStatus
      .mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })
      .mockResolvedValue(complete)
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.createBackup()
    await settle()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'active', operationId: accepted.id, polling: { kind: 'manual' } },
    })

    controller.resumePolling()
    await settle()

    expect(mocks.getBackupStatus).toHaveBeenCalledTimes(2)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'available', operationId: accepted.id },
    })
    scope.stop()
  })

  it('continues polling an available operation while cleanup is pending', async () => {
    vi.useFakeTimers()
    const accepted = cleanupPendingBackup('backup-created')
    const complete = sourceBackup(accepted.id)
    mocks.createBackup.mockResolvedValue(accepted)
    mocks.getBackupStatus.mockResolvedValueOnce(accepted).mockResolvedValue(complete)
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.createBackup()
    await settle()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'available', operationId: accepted.id, cleanupPending: true },
    })

    await vi.advanceTimersByTimeAsync(1_500)
    await settle()

    expect(mocks.getBackupStatus).toHaveBeenCalledTimes(2)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'available', operationId: accepted.id, cleanupPending: false },
    })
    scope.stop()
  })

  it('adopts a durable terminal operation after reload without issuing a command', async () => {
    const operation = sourceBackup('backup-after-reload')
    mocks.getInstallationStatus.mockResolvedValue({
      ...readyInstallation,
      activeOperation: {
        operationId: operation.id,
        kind: 'backup',
        phase: 'lifecycle_transition',
        checkpoint: 'structurally_ready',
        progress: 1,
        lastSafeSequence: operation.lastSafeSequence,
        errorCode: null,
      },
    })
    mocks.getBackupStatus.mockResolvedValue(operation)
    const { controller, scope } = createController()

    await controller.refresh()
    await settle()

    expect(mocks.getBackupStatus).toHaveBeenCalledWith({ backupId: operation.id })
    expect(mocks.createBackup).not.toHaveBeenCalled()
    expect(mocks.restoreBackup).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      recovery: { kind: 'none' },
      operation: { kind: 'available', operationId: operation.id },
    })
    scope.stop()
  })

  it('retries durable operation adoption after a transient status failure', async () => {
    const operation = sourceBackup('backup-after-reload')
    mocks.getInstallationStatus.mockResolvedValue({
      ...readyInstallation,
      activeOperation: {
        operationId: operation.id,
        kind: 'backup',
        phase: 'lifecycle_transition',
        checkpoint: 'structurally_ready',
        progress: 1,
        lastSafeSequence: operation.lastSafeSequence,
        errorCode: 'BACKUP_FAILED',
      },
    })
    mocks.getBackupStatus
      .mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })
      .mockResolvedValue(operation)
    const { controller, scope } = createController()

    await controller.refresh()
    await settle()
    expect(mocks.getBackupStatus).toHaveBeenCalledTimes(1)

    await controller.refresh()
    await settle()

    expect(mocks.getBackupStatus).toHaveBeenCalledTimes(2)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'available', operationId: operation.id },
    })
    scope.stop()
  })

  it('adopts a durable terminal failure after a command failure refreshes status', async () => {
    const operation = failedBackup('backup-failed-after-command')
    mocks.getInstallationStatus
      .mockResolvedValueOnce(readyInstallation)
      .mockResolvedValueOnce(readyInstallation)
      .mockResolvedValueOnce({
        ...readyInstallation,
        activeOperation: {
          operationId: operation.id,
          kind: 'backup',
          phase: 'lifecycle_transition',
          checkpoint: 'structurally_ready',
          progress: 1,
          lastSafeSequence: operation.lastSafeSequence,
          errorCode: 'BACKUP_FAILED',
        },
      })
    mocks.createBackup.mockRejectedValue({ code: 'INTERNAL_SERVER_ERROR' })
    mocks.getBackupStatus.mockResolvedValue(operation)
    const { controller, scope } = createController()

    await controller.refresh()
    await controller.createBackup()
    await settle()

    expect(mocks.getBackupStatus).toHaveBeenCalledWith({ backupId: operation.id })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      operation: { kind: 'failed', operationId: operation.id },
    })
    scope.stop()
  })

  it('keeps restore confirmation open when admission becomes conflicted', async () => {
    const source = sourceBackup()
    mocks.listBackups.mockResolvedValue(page([source]))
    mocks.getInstallationStatus.mockResolvedValueOnce(readyInstallation).mockResolvedValueOnce({
      ...readyInstallation,
      status: 'maintenance',
      activeOperation: {
        operationId: 'upgrade-1',
        kind: 'upgrade',
        phase: 'lifecycle_transition',
        checkpoint: 'none',
        progress: 0.2,
        lastSafeSequence: null,
        errorCode: null,
      },
    })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.openRestore(source.id)
    await controller.confirmRestore('RESTORE')

    expect(mocks.restoreBackup).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: { kind: 'confirming', error: { code: 'CONFLICT' } },
    })
    scope.stop()
  })

  it('disables confirmation but keeps cancel available when the open dialog becomes locked', async () => {
    const source = sourceBackup()
    const heldInstallation = {
      ...readyInstallation,
      status: 'maintenance',
      activeOperation: {
        operationId: 'upgrade-1',
        kind: 'upgrade',
        phase: 'lifecycle_transition',
        checkpoint: 'none',
        progress: 0.2,
        lastSafeSequence: null,
        errorCode: null,
      },
    } satisfies Installation
    mocks.listBackups.mockResolvedValue(page([source]))
    mocks.getInstallationStatus
      .mockResolvedValueOnce(readyInstallation)
      .mockResolvedValueOnce(heldInstallation)
    const { controller, scope } = createController()
    await controller.refresh()
    controller.openRestore(source.id)

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: {
        kind: 'confirming',
        confirmation: { canConfirm: true, confirmDisabledReason: null },
      },
    })

    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: {
        kind: 'confirming',
        confirmation: {
          canConfirm: false,
          confirmDisabledReason: 'Upgrade is active. Refresh after it finishes.',
        },
      },
    })

    controller.cancelRestore()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: { kind: 'blocked', reason: 'Upgrade is active. Refresh after it finishes.' },
    })
    scope.stop()
  })

  it('keeps an incompatibility error in the dialog when no durable operation exists', async () => {
    const source = sourceBackup()
    mocks.listBackups.mockResolvedValue(page([source]))
    mocks.restoreBackup.mockRejectedValue({ code: 'INCOMPATIBLE_BACKUP' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.openRestore(source.id)

    await controller.confirmRestore('RESTORE')

    expect(mocks.restoreBackup).toHaveBeenCalledTimes(1)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: { kind: 'confirming', error: { code: 'INCOMPATIBLE_BACKUP' } },
    })
    scope.stop()
  })

  it('locks restore confirmation before admission resolves and ignores duplicate submits', async () => {
    const source = sourceBackup()
    let resolveAdmission: (installation: Installation) => void = () => undefined
    const admission = new Promise<Installation>((resolve) => {
      resolveAdmission = resolve
    })
    mocks.listBackups.mockResolvedValue(page([source]))
    mocks.getInstallationStatus
      .mockResolvedValueOnce(readyInstallation)
      .mockReturnValueOnce(admission)
    mocks.restoreBackup.mockResolvedValue(sourceBackup('restore-result'))
    mocks.getBackupStatus.mockResolvedValue(sourceBackup('restore-result'))
    const { controller, scope } = createController()
    await controller.refresh()
    controller.openRestore(source.id)

    const confirmation = controller.confirmRestore('RESTORE')
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      restore: { kind: 'submitting', selected: { id: source.id } },
    })

    controller.cancelRestore()
    await controller.confirmRestore('RESTORE')
    expect(mocks.restoreBackup).not.toHaveBeenCalled()

    resolveAdmission(readyInstallation)
    await confirmation
    await settle()

    expect(mocks.restoreBackup).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
