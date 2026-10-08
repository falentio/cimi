import { effectScope, ref } from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicDashboardClient, PublicDashboardConfig } from './public-dashboard.types'
import { useSitePublicDashboard } from './useSitePublicDashboard'

const getPublicDashboardConfig = vi.fn()

const enablePublicDashboard = vi.fn()

const disablePublicDashboard = vi.fn()

const rotatePublicDashboardIdentifier = vi.fn()

const client: PublicDashboardClient = {
  publicDashboard: {
    getPublicDashboardConfig: { call: getPublicDashboardConfig },
    enablePublicDashboard: { call: enablePublicDashboard },
    disablePublicDashboard: { call: disablePublicDashboard },
    rotatePublicDashboardIdentifier: { call: rotatePublicDashboardIdentifier },
  },
}

const mocks = {
  getPublicDashboardConfig,
  enablePublicDashboard,
  disablePublicDashboard,
  rotatePublicDashboardIdentifier,
  client,
}

function config(overrides: Partial<PublicDashboardConfig> = {}): PublicDashboardConfig {
  return {
    siteId: 'ste_1',
    enabled: true,
    publicDashboardIdentifier: 'identifier-one',
    updatedAt: '2026-10-08T10:00:00Z',
    ...overrides,
  }
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.getPublicDashboardConfig.mockResolvedValue(config())
  mocks.enablePublicDashboard.mockResolvedValue(config({ publicDashboardIdentifier: 'fresh' }))
  mocks.disablePublicDashboard.mockResolvedValue(undefined)
  mocks.rotatePublicDashboardIdentifier.mockResolvedValue(
    config({ publicDashboardIdentifier: 'rotated' }),
  )
}

function createController(siteId: string = 'ste_1') {
  const scope = effectScope()
  const id = ref<string | undefined>(siteId)
  let controller: ReturnType<typeof useSitePublicDashboard> | undefined

  scope.run(() => {
    controller = useSitePublicDashboard({ siteId: id, client: mocks.client })
  })

  if (controller === undefined) throw new Error('Controller was not created.')

  return { controller, scope, id }
}

beforeEach(() => {
  resetMocks()
  vi.restoreAllMocks()
  vi.spyOn(toast, 'success')
  vi.spyOn(toast, 'error')
})

afterEach(() => vi.useRealTimers())

describe('useSitePublicDashboard', () => {
  it('reads the config with the exact Site input', async () => {
    const { controller, scope } = createController()
    await controller.refresh()

    expect(mocks.getPublicDashboardConfig).toHaveBeenCalledWith({ siteId: 'ste_1' })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'enabled',
      config: { publicDashboardIdentifier: 'identifier-one' },
      operations: ['rotate', 'disable'],
    })
    scope.stop()
  })

  it('reports a Site with no stored dashboard as unconfigured rather than an error', async () => {
    mocks.getPublicDashboardConfig.mockRejectedValue({ code: 'NOT_FOUND', status: 404 })
    const { controller, scope } = createController()
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'unconfigured',
      config: null,
      operations: ['enable'],
    })
    scope.stop()
  })

  it('enables, adopts the rotated identifier, and re-reads the server state', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('enable')
    await controller.confirm()

    expect(mocks.enablePublicDashboard).toHaveBeenCalledWith({ siteId: 'ste_1' })
    expect(mocks.getPublicDashboardConfig).toHaveBeenCalledTimes(2)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'enabled',
      notice: { operation: 'enable', warning: null },
    })
    scope.stop()
  })

  it('disables and revokes the identifier without returning a config', async () => {
    mocks.getPublicDashboardConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValue(config({ enabled: false }))
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('disable')
    await controller.confirm()

    expect(mocks.disablePublicDashboard).toHaveBeenCalledWith({ siteId: 'ste_1' })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'disabled',
      notice: { operation: 'disable' },
    })
    scope.stop()
  })

  it('rotates while public access stays enabled', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('rotate')
    await controller.confirm()

    expect(mocks.rotatePublicDashboardIdentifier).toHaveBeenCalledWith({ siteId: 'ste_1' })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'enabled',
      notice: { operation: 'rotate' },
    })
    scope.stop()
  })

  it('does nothing when confirm runs without an open confirmation', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.confirm()

    expect(mocks.enablePublicDashboard).not.toHaveBeenCalled()
    expect(mocks.disablePublicDashboard).not.toHaveBeenCalled()
    expect(mocks.rotatePublicDashboardIdentifier).not.toHaveBeenCalled()
    scope.stop()
  })

  it('drops the confirmation when it is cancelled', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('disable')
    controller.cancel()
    await controller.confirm()

    expect(mocks.disablePublicDashboard).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({ kind: 'ready', command: { kind: 'idle' } })
    scope.stop()
  })

  it('surfaces a conflict after the fact and hides the raw server text', async () => {
    mocks.disablePublicDashboard.mockRejectedValue({
      code: 'CONFLICT',
      status: 409,
      message: '/srv/private SQL secret',
    })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('disable')
    await controller.confirm()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      status: 'enabled',
      command: { kind: 'failed', operation: 'disable', error: { kind: 'conflict' } },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('/srv/private')
    scope.stop()
  })

  it('keeps the committed notice and warns when the follow-up read fails', async () => {
    mocks.getPublicDashboardConfig
      .mockResolvedValueOnce(config())
      .mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('rotate')
    await controller.confirm()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      notice: { operation: 'rotate', warning: { kind: 'server' } },
    })
    scope.stop()
  })

  it('maps a forbidden read to an access error', async () => {
    mocks.getPublicDashboardConfig.mockRejectedValue({ code: 'FORBIDDEN', status: 403 })
    const { controller, scope } = createController()
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'access-error',
      error: { kind: 'forbidden', action: 'contact-admin' },
    })
    scope.stop()
  })

  it('keeps a stale config visible and blocks operations after a failed refresh', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    mocks.getPublicDashboardConfig.mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      stale: true,
      config: { publicDashboardIdentifier: 'identifier-one' },
    })
    scope.stop()
  })

  it('never calls the API without a parsed Site id', async () => {
    const { controller, scope } = createController('')
    await controller.refresh()

    expect(mocks.getPublicDashboardConfig).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'error',
      error: { kind: 'not-found', action: 'refresh' },
    })
    scope.stop()
  })

  it('re-reads when the Site id changes under the controller', async () => {
    const { controller, scope, id } = createController()
    await controller.refresh()
    id.value = 'ste_2'
    await Promise.resolve()

    expect(mocks.getPublicDashboardConfig).toHaveBeenCalledTimes(2)
    expect(mocks.getPublicDashboardConfig).toHaveBeenLastCalledWith({ siteId: 'ste_2' })
    scope.stop()
  })

  it('announces a rotated identifier as a Sonner success toast', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('rotate')
    await controller.confirm()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'A new identifier was issued. The previous public URL no longer resolves.',
    )
    scope.stop()
  })

  it('announces disabled public access as a Sonner success toast', async () => {
    mocks.getPublicDashboardConfig
      .mockResolvedValueOnce(config())
      .mockResolvedValue(config({ enabled: false }))
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('disable')
    await controller.confirm()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'The public dashboard is disabled and its identifier was revoked. The server authorizes no new public request.',
    )
    scope.stop()
  })

  it('keeps a failed command inline and raises no Sonner toast', async () => {
    mocks.disablePublicDashboard.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('disable')
    await controller.confirm()

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', operation: 'disable', error: { kind: 'conflict' } },
    })
    scope.stop()
  })

  it('raises no Sonner toast once the scope is disposed before the command settles', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('rotate')
    const pending = controller.confirm()
    scope.stop()
    await pending

    expect(toast.success).not.toHaveBeenCalled()
  })

  it('keeps one success toast when the follow-up reconcile read fails', async () => {
    mocks.getPublicDashboardConfig
      .mockResolvedValueOnce(config())
      .mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.request('rotate')
    await controller.confirm()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(
      'A new identifier was issued. The previous public URL no longer resolves.',
    )
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      notice: { operation: 'rotate', warning: { kind: 'server' } },
    })
    scope.stop()
  })

  it('stops applying responses after the scope is disposed', async () => {
    const { controller, scope } = createController()
    const pending = controller.refresh()
    scope.stop()
    await pending

    expect(controller.view.value).toMatchObject({ kind: 'loading' })
  })
})
