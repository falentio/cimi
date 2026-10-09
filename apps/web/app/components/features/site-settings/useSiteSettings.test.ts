import { createApp, effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthState } from '../../../composables/useAuth'
import { SITE_DELETION_STARTED_MESSAGE, SITE_SETTINGS_SAVED_MESSAGE } from './site-settings.utils'
import type { Site, SiteSettingsController, SiteSettingsDraft } from './site-settings.types'
import { useSiteSettings } from './useSiteSettings'

const site: Site = {
  id: 'ste_1',
  organizationId: 'org_1',
  name: 'Marketing site',
  hostname: 'www.example.com',
  ingestionIdentifier: 'ing_1',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const draft: SiteSettingsDraft = {
  name: 'Marketing site',
  hostname: 'www.example.com',
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday',
}

const getSite = vi.fn()

const updateSiteV2 = vi.fn()

const deleteSite = vi.fn()

const session = ref<AuthState>({
  status: 'authenticated',
  session: {
    user: {
      id: 'usr_1',
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: true,
      image: null,
      role: 'user',
    },
  },
})

const orpc = {
  site: {
    getSite: { call: getSite },
    updateSiteV2: { mutationOptions: () => ({ mutation: updateSiteV2 }) },
    deleteSite: { mutationOptions: () => ({ mutation: deleteSite }) },
  },
}

type Controller = ReturnType<typeof useSiteSettings>

interface Harness {
  readonly controller: Controller
  readonly scope: EffectScope
  readonly siteId: Ref<string | undefined>
}

async function settle(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

async function createHarness(siteId: Ref<string | undefined> = ref('ste_1')): Promise<Harness> {
  const app = createApp({})
  const pinia = createPinia()
  app.use(pinia)
  app.use(PiniaColada, { pinia })
  const scope = effectScope()
  const controller = scope.run(() => app.runWithContext(() => useSiteSettings({ siteId })))

  if (controller === undefined) throw new Error('Controller was not created.')

  await settle()

  return { controller, scope, siteId }
}

function snapshot(controller: Controller): SiteSettingsController['snapshot']['value'] {
  return controller.snapshot.value
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.spyOn(toast, 'success')
  getSite.mockResolvedValue(site)
  updateSiteV2.mockResolvedValue(site)
  deleteSite.mockResolvedValue({ operationId: 'op_1' })
  vi.stubGlobal('useState', (key: string) => (key === 'auth:session' ? session : ref(undefined)))
  vi.stubGlobal('useNuxtApp', () => ({ $orpc: orpc }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSiteSettings', () => {
  it('loads the Site from the repository before any mutation runs', async () => {
    const { controller, scope } = await createHarness()

    expect(snapshot(controller).load).toMatchObject({ status: 'ready', site: { id: 'ste_1' } })
    expect(getSite).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('raises exactly one success toast with the inline copy when a save commits', async () => {
    const { controller, scope } = await createHarness()
    await controller.save(draft)

    expect(snapshot(controller).save).toMatchObject({ status: 'saved', site: { id: 'ste_1' } })
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(SITE_SETTINGS_SAVED_MESSAGE)
    expect(SITE_SETTINGS_SAVED_MESSAGE).toBe('Changes saved.')
    scope.stop()
  })

  it('keeps one success toast when the follow-up invalidation warns', async () => {
    const { controller, scope } = await createHarness()
    const cache = (await import('@pinia/colada')).useQueryCache()
    vi.spyOn(cache, 'invalidateQueries').mockRejectedValue(new Error('cache offline'))
    await controller.save(draft)

    expect(snapshot(controller).save).toMatchObject({ status: 'saved' })
    expect(snapshot(controller).save).toHaveProperty('warning')
    expect(toast.success).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('raises no toast when the save fails', async () => {
    updateSiteV2.mockRejectedValue({ code: 'CONFLICT' })
    const { controller, scope } = await createHarness()

    await expect(controller.save(draft)).rejects.toBeTruthy()

    expect(snapshot(controller).save).toMatchObject({ status: 'error' })
    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })

  it('raises no toast once the scope is disposed before the save settles', async () => {
    let resolveSave: (value: Site) => void = () => {}

    updateSiteV2.mockImplementation(
      () =>
        new Promise<Site>((resolve) => {
          resolveSave = resolve
        }),
    )
    const { controller, scope } = await createHarness()
    const pending = controller.save(draft)
    scope.stop()
    await nextTick()
    resolveSave(site)
    await pending

    expect(snapshot(controller).save).toMatchObject({ status: 'saving' })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('raises exactly one success toast with the inline copy when deletion is accepted', async () => {
    const { controller, scope } = await createHarness()
    controller.beginDelete()
    await controller.confirmDelete()

    expect(snapshot(controller).deletion).toMatchObject({ status: 'accepted', operationId: 'op_1' })
    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(SITE_DELETION_STARTED_MESSAGE)
    expect(SITE_DELETION_STARTED_MESSAGE).toBe(
      "Deletion started. The site is recoverable until the server's purge deadline.",
    )
    scope.stop()
  })

  it('raises no toast when deletion is refused', async () => {
    deleteSite.mockRejectedValue({ code: 'CONFLICT' })
    const { controller, scope } = await createHarness()
    controller.beginDelete()

    await expect(controller.confirmDelete()).rejects.toBeTruthy()

    expect(snapshot(controller).deletion).toMatchObject({ status: 'error' })
    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })

  it('raises no toast once the scope is disposed before deletion settles', async () => {
    let resolveDelete: (value: { operationId: string }) => void = () => {}

    deleteSite.mockImplementation(
      () =>
        new Promise<{ operationId: string }>((resolve) => {
          resolveDelete = resolve
        }),
    )
    const { controller, scope } = await createHarness()
    controller.beginDelete()
    const pending = controller.confirmDelete()
    scope.stop()
    await nextTick()
    resolveDelete({ operationId: 'op_1' })
    await pending

    expect(snapshot(controller).deletion).toMatchObject({ status: 'submitting' })
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('raises no toast when the Site context changes before the save settles', async () => {
    let resolveSave: (value: Site) => void = () => {}

    updateSiteV2.mockImplementation(
      () =>
        new Promise<Site>((resolve) => {
          resolveSave = resolve
        }),
    )
    const { controller, scope, siteId } = await createHarness()
    const pending = controller.save(draft)
    siteId.value = 'ste_2'
    await nextTick()
    resolveSave(site)
    await pending

    expect(toast.success).not.toHaveBeenCalled()
    scope.stop()
  })
})
