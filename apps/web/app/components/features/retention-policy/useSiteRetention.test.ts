import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RetentionPolicy } from './retention-policy.types'
import type { SiteRetentionResult } from './site-retention.types'

const mocks = vi.hoisted(() => {
  const getRetentionPolicy = vi.fn()
  const updateRetentionPolicy = vi.fn()
  return {
    getRetentionPolicy,
    updateRetentionPolicy,
    client: {
      retentionPolicy: {
        getRetentionPolicy: { call: getRetentionPolicy },
        updateRetentionPolicy: { call: updateRetentionPolicy },
      },
    },
  }
})

vi.mock('@/composables/useOrpc', () => ({ useOrpc: () => mocks.client }))

import { useSiteRetention } from './useSiteRetention'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const twelve: RetentionPolicy = { eventMonths: 12, profileMonths: 12, replayMonths: null }

function siteResult(overrides: Partial<SiteRetentionResult> = {}): SiteRetentionResult {
  return {
    scope: 'site',
    siteId: 'site-1',
    installationDefault: twelve,
    siteOverride: null,
    effectivePolicy: twelve,
    cleanup: { pending: false, derived: none, backup: none },
    updatedAt: '2026-09-18T10:00:00Z',
    ...overrides,
  }
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.getRetentionPolicy.mockResolvedValue(siteResult())
}

function createController(siteId: string | undefined = 'site-1') {
  const scope = effectScope()
  const id = ref(siteId)
  let controller: ReturnType<typeof useSiteRetention> | undefined
  scope.run(() => {
    controller = useSiteRetention({ siteId: id })
  })
  if (controller === undefined) throw new Error('Controller was not created.')
  return { controller, scope, id }
}

function createControllerWithoutSite() {
  const scope = effectScope()
  let controller: ReturnType<typeof useSiteRetention> | undefined
  scope.run(() => {
    controller = useSiteRetention({ siteId: undefined })
  })
  if (controller === undefined) throw new Error('Controller was not created.')
  return { controller, scope }
}

beforeEach(resetMocks)
afterEach(() => vi.useRealTimers())

describe('useSiteRetention', () => {
  it('reads the Site scope with the exact input and never fetches installation status', async () => {
    const { controller, scope } = createController()
    await controller.refresh()

    expect(mocks.getRetentionPolicy).toHaveBeenCalledWith({ scope: 'site', siteId: 'site-1' })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      result: { scope: 'site', siteId: 'site-1' },
      provenance: 'installation-default',
    })
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    scope.stop()
  })

  it('writes the override verbatim even when it is longer than the installation default', async () => {
    const longer: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }
    mocks.updateRetentionPolicy.mockResolvedValue(
      siteResult({
        siteOverride: longer,
        effectivePolicy: longer,
        updatedAt: '2026-09-18T12:00:00Z',
      }),
    )
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit(longer)

    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'site',
      siteId: 'site-1',
      policy: { eventMonths: 24, profileMonths: 24, replayMonths: null },
    })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      provenance: 'site-override',
      result: { updatedAt: '2026-09-18T12:00:00Z' },
    })
    expect(mocks.getRetentionPolicy).toHaveBeenCalledTimes(2)
    scope.stop()
  })

  it('requires the exact acknowledgement before a shortening write', async () => {
    const shorter: RetentionPolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    mocks.updateRetentionPolicy.mockResolvedValue(
      siteResult({
        siteOverride: shorter,
        effectivePolicy: shorter,
        updatedAt: '2026-09-18T12:00:00Z',
      }),
    )
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.submit(shorter)
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'confirming', acknowledgement: { kind: 'required' } },
    })

    await controller.confirmShortening('not the phrase')
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()

    await controller.confirmShortening('SHORTEN RETENTION')
    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'site',
      siteId: 'site-1',
      policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    })
    scope.stop()
  })

  it('sends policy null when clearing and treats a shortening clear as confirmation-gated', async () => {
    const longer: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }
    mocks.getRetentionPolicy.mockResolvedValue(
      siteResult({
        installationDefault: twelve,
        siteOverride: longer,
        effectivePolicy: longer,
      }),
    )
    mocks.updateRetentionPolicy.mockResolvedValue(siteResult({ updatedAt: '2026-09-18T12:00:00Z' }))
    const { controller, scope } = createController()
    await controller.refresh()

    await controller.clear()
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'confirming', proposal: { kind: 'inherit' } },
    })

    controller.cancelConfirmation()
    await controller.clear()
    await controller.confirmShortening('SHORTEN RETENTION')

    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'site',
      siteId: 'site-1',
      policy: null,
    })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      provenance: 'installation-default',
      notice: { kind: 'committed' },
    })
    scope.stop()
  })

  it('clears without confirmation when the installation default is not shorter', async () => {
    const shorter: RetentionPolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    mocks.getRetentionPolicy.mockResolvedValue(
      siteResult({ siteOverride: shorter, effectivePolicy: shorter }),
    )
    mocks.updateRetentionPolicy.mockResolvedValue(siteResult({ updatedAt: '2026-09-18T12:00:00Z' }))
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.clear()

    expect(mocks.updateRetentionPolicy).toHaveBeenCalledWith({
      scope: 'site',
      siteId: 'site-1',
      policy: null,
    })
    scope.stop()
  })

  it('does nothing when the Site has no override to clear', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.clear()

    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    scope.stop()
  })

  it('blocks a commit when the baseline changed and reports a stale confirmation', async () => {
    const longer: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }
    mocks.getRetentionPolicy.mockResolvedValueOnce(siteResult()).mockResolvedValue(
      siteResult({
        siteOverride: longer,
        effectivePolicy: longer,
        updatedAt: '2026-09-18T11:00:00Z',
      }),
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

  it('blocks a commit when the installation default moved under the override', async () => {
    mocks.getRetentionPolicy.mockResolvedValueOnce(siteResult()).mockResolvedValue(
      siteResult({
        installationDefault: { eventMonths: 18, profileMonths: 18, replayMonths: null },
        updatedAt: '2026-09-18T10:00:00Z',
      }),
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

  it('surfaces a server conflict after the fact with a refresh action', async () => {
    mocks.updateRetentionPolicy.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.submit({ eventMonths: 18, profileMonths: 18, replayMonths: null })

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      command: { kind: 'failed', error: { kind: 'conflict', action: 'refresh' } },
    })
    scope.stop()
  })

  it('keeps the draft and hides raw server text after BAD_REQUEST', async () => {
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
      policy: { draft: { eventMonths: '18', profileMonths: '18' } },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('/private')
    scope.stop()
  })

  it('maps an unavailable Site read to the Site-specific not-found copy', async () => {
    mocks.getRetentionPolicy.mockRejectedValue({ code: 'NOT_FOUND', status: 404 })
    const { controller, scope } = createController()
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'error',
      error: {
        kind: 'not-found',
        message: 'This Site is unavailable. Refresh or choose another Site.',
      },
    })
    scope.stop()
  })

  it('keeps a dirty draft when a refresh becomes stale and clears a failed save on recovery', async () => {
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

    mocks.getRetentionPolicy.mockResolvedValue(siteResult())
    await controller.refresh()
    expect(controller.view.value).toMatchObject({ kind: 'ready', stale: false })
    scope.stop()
  })

  it('reports an access error for a forbidden read', async () => {
    mocks.getRetentionPolicy.mockRejectedValue({ code: 'FORBIDDEN', status: 403 })
    const { controller, scope } = createController()
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'access-error',
      error: { kind: 'forbidden', action: 'contact-admin' },
    })
    scope.stop()
  })

  it('does not read or write without a parsed Site id', async () => {
    const { controller, scope } = createControllerWithoutSite()
    await controller.refresh()
    await controller.submit(twelve)

    expect(mocks.getRetentionPolicy).not.toHaveBeenCalled()
    expect(mocks.updateRetentionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({ kind: 'loading' })
    scope.stop()
  })

  it('re-reads when the Site id changes under the controller', async () => {
    const { controller, scope, id } = createController()
    await controller.refresh()
    expect(mocks.getRetentionPolicy).toHaveBeenCalledWith({ scope: 'site', siteId: 'site-1' })

    id.value = 'site-2'
    await Promise.resolve()

    expect(mocks.getRetentionPolicy).toHaveBeenCalledTimes(2)
    expect(mocks.getRetentionPolicy).toHaveBeenLastCalledWith({ scope: 'site', siteId: 'site-2' })
    expect(controller.view.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })
})
