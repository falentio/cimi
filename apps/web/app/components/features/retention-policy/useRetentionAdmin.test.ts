import { effectScope } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Installation,
  InstallationRetentionResult,
  RetentionPolicy,
} from './retention-policy.types'

const mocks = vi.hoisted(() => {
  const getRetentionPolicy = vi.fn()
  const updateRetentionPolicy = vi.fn()
  const getInstallationStatus = vi.fn()
  return {
    getRetentionPolicy,
    updateRetentionPolicy,
    getInstallationStatus,
    client: {
      retentionPolicy: {
        getRetentionPolicy: { call: getRetentionPolicy },
        updateRetentionPolicy: { call: updateRetentionPolicy },
      },
      installation: { getInstallationStatus: { call: getInstallationStatus } },
    },
  }
})

vi.mock('@/composables/useOrpc', () => ({ useOrpc: () => mocks.client }))

import { useRetentionAdmin } from './useRetentionAdmin'

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

function retentionResult(
  policy: RetentionPolicy = { eventMonths: 12, profileMonths: 12, replayMonths: null },
  overrides: Partial<InstallationRetentionResult> = {},
): InstallationRetentionResult {
  return {
    scope: 'installation',
    installationDefault: policy,
    siteOverride: null,
    effectivePolicy: policy,
    cleanup: { pending: false, derived: none, backup: none },
    updatedAt: '2026-09-18T10:00:00Z',
    ...overrides,
  }
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.getRetentionPolicy.mockResolvedValue(retentionResult())
  mocks.getInstallationStatus.mockResolvedValue(readyInstallation)
}

function createController() {
  const scope = effectScope()
  let controller: ReturnType<typeof useRetentionAdmin> | undefined
  scope.run(() => {
    controller = useRetentionAdmin()
  })
  if (controller === undefined) throw new Error('Controller was not created.')
  return { controller, scope }
}

beforeEach(resetMocks)
afterEach(() => vi.useRealTimers())

describe('useRetentionAdmin', () => {
  it('loads installation retention and lifecycle status with exact scoped inputs', async () => {
    const { controller, scope } = createController()
    await controller.refresh()

    expect(mocks.getRetentionPolicy).toHaveBeenCalledWith({ scope: 'installation' })
    expect(mocks.getInstallationStatus).toHaveBeenCalledWith({})
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      result: { scope: 'installation' },
    })
    scope.stop()
  })

  it('updates extensions directly and adopts the returned cleanup snapshot', async () => {
    const saved = retentionResult(
      { eventMonths: 18, profileMonths: 18, replayMonths: null },
      {
        updatedAt: '2026-09-18T12:00:00Z',
        cleanup: {
          pending: true,
          derived: { status: 'pending', startedAt: null, completedAt: null, errorCode: null },
          backup: { status: 'not_started', startedAt: null, completedAt: null, errorCode: null },
        },
      },
    )
    mocks.updateRetentionPolicy.mockResolvedValue(saved)
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit(saved.installationDefault)

    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'installation',
      policy: saved.installationDefault,
    })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      result: { updatedAt: '2026-09-18T12:00:00Z', cleanup: { pending: true } },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('operationId')
    expect(mocks.getRetentionPolicy).toHaveBeenCalledTimes(2)
    expect(mocks.getInstallationStatus).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('requires the exact UI-only acknowledgement before shortening', async () => {
    const candidate = { eventMonths: 6, profileMonths: 6, replayMonths: null } as const
    mocks.updateRetentionPolicy.mockResolvedValue(
      retentionResult(candidate, { updatedAt: '2026-09-18T12:00:00Z' }),
    )
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.submit(candidate)
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'confirming', acknowledgement: { kind: 'required' } },
    })

    controller.cancelConfirmation()
    expect(controller.view.value).toMatchObject({ kind: 'ready', command: { kind: 'idle' } })
    await controller.submit(candidate)
    await controller.confirmShortening('SHORTEN RETENTION')
    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'installation',
      policy: candidate,
    })
    scope.stop()
  })

  it('blocks a write when the fresh lifecycle status is held', async () => {
    mocks.getInstallationStatus.mockResolvedValueOnce(readyInstallation).mockResolvedValue({
      ...readyInstallation,
      activeOperation: {
        operationId: 'operation-1',
        kind: 'backup',
        phase: 'lifecycle_transition',
        checkpoint: 'none',
        progress: null,
        lastSafeSequence: null,
        errorCode: null,
      },
    })
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit({ eventMonths: 18, profileMonths: 18, replayMonths: null })

    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'conflict' } },
    })
    scope.stop()
  })

  it('blocks confirmation when the fresh retention snapshot changed', async () => {
    mocks.getRetentionPolicy
      .mockResolvedValueOnce(retentionResult())
      .mockResolvedValue(
        retentionResult(
          { eventMonths: 9, profileMonths: 9, replayMonths: null },
          { updatedAt: '2026-09-18T11:00:00Z' },
        ),
      )
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit({ eventMonths: 6, profileMonths: 6, replayMonths: null })
    await controller.confirmShortening('SHORTEN RETENTION')

    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'stale-confirmation' } },
    })
    scope.stop()
  })

  it('keeps the original confirmation baseline when a refresh changes the snapshot', async () => {
    const candidate = { eventMonths: 6, profileMonths: 6, replayMonths: null } as const
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit(candidate)

    mocks.getRetentionPolicy.mockResolvedValue(
      retentionResult(
        { eventMonths: 24, profileMonths: 24, replayMonths: null },
        { updatedAt: '2026-09-18T11:00:00Z' },
      ),
    )
    await controller.refresh()
    await controller.confirmShortening('SHORTEN RETENTION')

    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'stale-confirmation' } },
    })
    scope.stop()
  })

  it('keeps a dirty draft when a refresh becomes stale', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.edit('eventMonths', '18')
    mocks.getRetentionPolicy.mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })

    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      stale: true,
      policy: { draft: { eventMonths: '18' } },
    })
    scope.stop()
  })

  it('preserves the draft after BAD_REQUEST and maps the failure safely', async () => {
    mocks.updateRetentionPolicy.mockRejectedValue({
      code: 'BAD_REQUEST',
      message: '/private SQL secret',
    })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.edit('eventMonths', '18')
    controller.edit('profileMonths', '18')
    await controller.submit({ eventMonths: 18, profileMonths: 18, replayMonths: null })

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'bad-request' } },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('/private')
    expect(controller.view.value).toMatchObject({
      policy: { draft: { eventMonths: '18', profileMonths: '18' } },
    })
    scope.stop()
  })

  it('clears a failed save after a successful refresh', async () => {
    mocks.updateRetentionPolicy.mockRejectedValue({ code: 'CONFLICT' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.edit('eventMonths', '18')
    controller.edit('profileMonths', '18')

    await controller.submit({ eventMonths: 18, profileMonths: 18, replayMonths: null })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'conflict' } },
    })

    await controller.refresh()

    expect(controller.view.value).toMatchObject({ kind: 'ready', command: { kind: 'idle' } })
    scope.stop()
  })
})
