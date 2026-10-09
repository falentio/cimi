import { createApp, effectScope } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPGRADE_COMPLETE_MESSAGE, UPGRADE_STARTED_MESSAGE } from './setup.utils'
import type { Health, Installation, SetupClient } from './setup.types'
import { useSetup } from './useSetup'

const cleanupStage = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const uninitializedInstallation = {
  status: 'uninitialized',
  defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  dataDirectoryReady: false,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: cleanupStage,
  backupCleanup: cleanupStage,
  updatedAt: '2026-10-09T00:00:00Z',
} satisfies Installation

const readyInstallation = {
  ...uninitializedInstallation,
  status: 'ready',
  dataDirectoryReady: true,
} satisfies Installation

const runningUpgrade = {
  ...readyInstallation,
  status: 'maintenance',
  activeOperation: {
    operationId: 'op_upgrade',
    kind: 'upgrade',
    phase: 'pre_upgrade_safety',
    checkpoint: 'none',
    progress: 0.2,
    lastSafeSequence: null,
    errorCode: null,
  },
} satisfies Installation

const health = {
  status: 'healthy',
  controlStore: 'ready',
  analyticsStore: 'ready',
  cleanupPending: false,
  version: '1.0.0',
  checkedAt: '2026-10-09T00:00:00Z',
} satisfies Health

const getInstallationStatus = vi.fn()

const initializeInstallation = vi.fn()

const upgradeInstallation = vi.fn()

const healthCall = vi.fn()

const client: SetupClient = {
  installation: {
    getInstallationStatus: {
      queryOptions: () => ({ key: ['installation'], query: () => getInstallationStatus() }),
    },
    initializeInstallation: {
      mutationOptions: () => ({
        key: () => ['initialize'],
        mutation: () => initializeInstallation(),
      }),
    },
    upgradeInstallation: {
      mutationOptions: () => ({ key: () => ['upgrade'], mutation: () => upgradeInstallation() }),
    },
  },
  health: { health: { queryOptions: () => ({ key: ['health'], query: () => healthCall() }) } },
}

const mocks = {
  getInstallationStatus,
  initializeInstallation,
  upgradeInstallation,
  healthCall,
  client,
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.getInstallationStatus.mockResolvedValue(readyInstallation)
  mocks.initializeInstallation.mockResolvedValue({ status: 201, body: uninitializedInstallation })
  mocks.upgradeInstallation.mockResolvedValue(runningUpgrade)
  mocks.healthCall.mockResolvedValue(health)
}

function createController() {
  const app = createApp({ render: () => null })
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada, { pinia })
  setActivePinia(pinia)
  const scope = effectScope()
  let controller: ReturnType<typeof useSetup> | undefined

  app.runWithContext(() => {
    scope.run(() => {
      controller = useSetup(mocks.client)
    })
  })

  if (controller === undefined) throw new Error('Controller was not created.')

  return { controller, scope }
}

beforeEach(() => {
  resetMocks()
  vi.restoreAllMocks()
  vi.spyOn(toast, 'success')
})

afterEach(() => vi.useRealTimers())

describe('useSetup', () => {
  it('raises one success toast when initialization creates the installation', async () => {
    const { controller, scope } = createController()

    await controller.initialize()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith('Installation initialized.')
    scope.stop()
  })

  it('reuses the notice message for a convergent initialization', async () => {
    mocks.initializeInstallation.mockResolvedValue({ status: 200, body: readyInstallation })
    const { controller, scope } = createController()

    await controller.initialize()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'Existing installation reused; no data was overwritten.',
    )
    scope.stop()
  })

  it('raises no toast when initialization fails', async () => {
    mocks.initializeInstallation.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = createController()

    await controller.initialize().catch(() => undefined)

    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })

  it('raises no toast once the scope is disposed before initialization settles', async () => {
    let resolveInitialize: (value: { status: number; body: Installation }) => void = () => undefined
    mocks.initializeInstallation.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInitialize = resolve
      }),
    )
    const { controller, scope } = createController()
    const pending = controller.initialize()
    scope.stop()
    resolveInitialize({ status: 201, body: uninitializedInstallation })
    await pending

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('announces the accepted upgrade once, before polling takes over', async () => {
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.submitUpgrade('UPGRADE')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(UPGRADE_STARTED_MESSAGE)
    scope.stop()
  })

  it('announces an upgrade that finishes synchronously', async () => {
    mocks.upgradeInstallation.mockResolvedValue(readyInstallation)
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.submitUpgrade('UPGRADE')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(UPGRADE_COMPLETE_MESSAGE)
    scope.stop()
  })

  it('raises no toast when the upgrade is rejected', async () => {
    mocks.upgradeInstallation.mockResolvedValue({
      ...runningUpgrade,
      activeOperation: { ...runningUpgrade.activeOperation, errorCode: 'UPGRADE_FAILED' },
    })
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.submitUpgrade('UPGRADE')

    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })

  it('raises no toast once the scope is disposed before the upgrade settles', async () => {
    let resolveUpgrade: (value: Installation) => void = () => undefined
    mocks.upgradeInstallation.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpgrade = resolve
      }),
    )
    const { controller, scope } = createController()
    await controller.refresh()
    const pending = controller.submitUpgrade('UPGRADE')
    scope.stop()
    resolveUpgrade(readyInstallation)
    await pending

    expect(toast.success).not.toHaveBeenCalled()
  })
})
