import { effectScope, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectionPolicyResult } from './collection-policy.types'

const mocks = vi.hoisted(() => {
  const getCollectionPolicy = vi.fn()
  const updateCollectionPolicy = vi.fn()
  return {
    getCollectionPolicy,
    updateCollectionPolicy,
    client: {
      collectionPolicy: {
        getCollectionPolicy: { call: getCollectionPolicy },
        updateCollectionPolicy: { call: updateCollectionPolicy },
      },
    },
  }
})

vi.mock('@/composables/useOrpc', () => ({ useOrpc: () => mocks.client }))

import { useSiteCollectionPolicy } from './useSiteCollectionPolicy'

const INSTALLATION_VALUES = {
  anonymousCollection: 'enabled',
  honorGpcDnt: true,
  consentMode: 'required_for_identity',
  botPolicy: 'exclude',
  captureQueryStrings: false,
  urlPolicy: {
    capturePath: true,
    captureReferrer: true,
    stripQueryStrings: true,
    stripSensitiveValues: true,
  },
  propertyPolicy: {
    allowScalarProperties: true,
    maxProperties: 64,
    maxValueLength: 512,
    reservedNames: [],
  },
  profileFilterKeys: [],
  exclusions: { hostnames: [], paths: [], countries: [], ipRanges: [] },
} as const satisfies Omit<CollectionPolicyResult['effective'], 'scope' | 'siteId'>

function policyResult(overrides: Partial<CollectionPolicyResult> = {}): CollectionPolicyResult {
  return {
    installationDefault: { scope: 'installation', ...INSTALLATION_VALUES },
    siteOverride: null,
    effective: { scope: 'site', siteId: 'ste_1', ...INSTALLATION_VALUES },
    source: {
      anonymousCollection: 'installation',
      honorGpcDnt: 'installation',
      consentMode: 'installation',
      botPolicy: 'installation',
      captureQueryStrings: 'installation',
      urlPolicy: 'installation',
      propertyPolicy: 'installation',
      profileFilterKeys: 'installation',
      exclusions: 'installation',
    },
    ...overrides,
  }
}

function siteOverrideResult(): CollectionPolicyResult {
  const source = {
    anonymousCollection: 'site',
    honorGpcDnt: 'site',
    consentMode: 'site',
    botPolicy: 'site',
    captureQueryStrings: 'site',
    urlPolicy: 'site',
    propertyPolicy: 'site',
    profileFilterKeys: 'site',
    exclusions: 'site',
  } as const
  return policyResult({
    siteOverride: { scope: 'site', siteId: 'ste_1', ...INSTALLATION_VALUES },
    effective: { scope: 'site', siteId: 'ste_1', ...INSTALLATION_VALUES },
    source: { ...source },
  })
}

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.getCollectionPolicy.mockResolvedValue(policyResult())
  mocks.updateCollectionPolicy.mockResolvedValue({
    scope: 'site',
    siteId: 'ste_1',
    ...INSTALLATION_VALUES,
  })
}

function createController(siteId: ReturnType<typeof ref<string | undefined>> = ref('ste_1')) {
  const scope = effectScope()
  let controller: ReturnType<typeof useSiteCollectionPolicy> | undefined
  scope.run(() => {
    controller = useSiteCollectionPolicy({ siteId })
  })
  if (controller === undefined) throw new Error('Controller was not created.')
  return { controller, scope, siteId }
}

beforeEach(resetMocks)
afterEach(() => vi.useRealTimers())

describe('useSiteCollectionPolicy', () => {
  it('reads the Site policy with the exact scoped input', async () => {
    const { controller, scope } = createController()
    await controller.refresh()

    expect(mocks.getCollectionPolicy).toHaveBeenCalledWith({ siteId: 'ste_1' })
    expect(controller.view.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })

  it('does not call the API when no Site id is available', async () => {
    const { controller, scope } = createController(ref(undefined))
    await controller.refresh()

    expect(mocks.getCollectionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({ kind: 'error', error: { kind: 'not-found' } })
    scope.stop()
  })

  it('refreshes when the Site id changes', async () => {
    const { controller, scope, siteId } = createController()
    await controller.refresh()
    siteId.value = 'ste_2'
    await Promise.resolve()

    expect(mocks.getCollectionPolicy).toHaveBeenCalledTimes(2)
    expect(mocks.getCollectionPolicy).toHaveBeenLastCalledWith({ siteId: 'ste_2' })
    expect(controller.view.value).toMatchObject({ kind: 'ready' })
    scope.stop()
  })

  it('sends all nine fields for a Site save and adopts the refreshed provenance', async () => {
    mocks.getCollectionPolicy
      .mockResolvedValueOnce(policyResult())
      .mockResolvedValue(siteOverrideResult())
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'botPolicy', value: 'include' })
    await controller.save()

    expect(mocks.updateCollectionPolicy).toHaveBeenCalledTimes(1)
    const request = mocks.updateCollectionPolicy.mock.calls[0]?.[0]
    expect(request.scope).toBe('site')
    expect(Object.keys(request.policy).sort()).toEqual(
      [
        'anonymousCollection',
        'botPolicy',
        'captureQueryStrings',
        'consentMode',
        'exclusions',
        'honorGpcDnt',
        'profileFilterKeys',
        'propertyPolicy',
        'siteId',
        'urlPolicy',
      ].sort(),
    )
    expect(request.policy.siteId).toBe('ste_1')
    expect(request.policy.botPolicy).toBe('include')
    expect(request.policy.honorGpcDnt).toBe(true)
    expect(mocks.getCollectionPolicy).toHaveBeenCalledTimes(2)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: { mode: 'view', dirty: false, hasOverride: true },
      notice: { kind: 'committed', warning: null },
    })
    scope.stop()
  })

  it('clears the override with the clear payload and keeps the site id', async () => {
    mocks.getCollectionPolicy
      .mockResolvedValueOnce(siteOverrideResult())
      .mockResolvedValue(policyResult())
    const { controller, scope } = createController()
    await controller.refresh()
    await controller.clearOverride()

    expect(mocks.updateCollectionPolicy).toHaveBeenCalledWith({
      scope: 'site',
      policy: { siteId: 'ste_1', clear: true },
    })
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: { hasOverride: false },
      notice: { kind: 'cleared' },
    })
    scope.stop()
  })

  it('keeps the saved state and warns when the follow-up refresh fails', async () => {
    mocks.getCollectionPolicy
      .mockResolvedValueOnce(policyResult())
      .mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR', message: '/srv/private SQL secret' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'botPolicy', value: 'include' })
    await controller.save()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      notice: { kind: 'committed', warning: { kind: 'server' } },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('/srv/private')
    scope.stop()
  })

  it('preserves the draft and stays in edit mode after BAD_REQUEST', async () => {
    mocks.updateCollectionPolicy.mockRejectedValue({
      code: 'BAD_REQUEST',
      message: '/srv/private SQL secret',
    })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'honorGpcDnt', value: false })
    await controller.save()

    expect(mocks.updateCollectionPolicy).toHaveBeenCalledTimes(1)
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: {
        mode: 'edit',
        draft: { honorGpcDnt: false },
        serverError: { kind: 'bad-request', action: 'edit' },
      },
    })
    expect(JSON.stringify(controller.view.value)).not.toContain('/srv/private')
    scope.stop()
  })

  it('refuses to save an invalid draft without calling the API', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'captureQueryStrings', value: true })
    await controller.save()

    expect(mocks.updateCollectionPolicy).not.toHaveBeenCalled()
    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: {
        validation: { kind: 'invalid' },
        canSubmit: false,
        serverError: null,
      },
    })
    scope.stop()
  })

  it('keeps a dirty draft when a refresh becomes stale', async () => {
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'honorGpcDnt', value: false })
    mocks.getCollectionPolicy.mockRejectedValueOnce({ code: 'INTERNAL_SERVER_ERROR' })

    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      stale: true,
      editor: { draft: { honorGpcDnt: false }, canSubmit: false },
    })
    scope.stop()
  })

  it('clears a failed save after a successful refresh', async () => {
    mocks.updateCollectionPolicy.mockRejectedValue({ code: 'CONFLICT' })
    const { controller, scope } = createController()
    await controller.refresh()
    controller.beginEdit()
    controller.edit({ field: 'botPolicy', value: 'include' })
    await controller.save()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: { serverError: { kind: 'conflict' } },
    })

    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'ready',
      editor: { serverError: null },
    })
    scope.stop()
  })

  it('maps a forbidden read to an access error', async () => {
    mocks.getCollectionPolicy.mockRejectedValue({ code: 'FORBIDDEN' })
    const { controller, scope } = createController()
    await controller.refresh()

    expect(controller.view.value).toMatchObject({
      kind: 'access-error',
      error: { kind: 'forbidden', action: 'contact-admin' },
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
