import { createApp, effectScope, ref } from 'vue'
import { createPinia } from 'pinia'
import { PiniaColada } from '@pinia/colada'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  OrganizationSiteCreationClient,
  OrganizationSiteCreationOptions,
} from './useOrganizationSiteCreation'
import { SITE_CREATED_MESSAGE, useOrganizationSiteCreation } from './useOrganizationSiteCreation'

const createSite = vi.fn()

const client: OrganizationSiteCreationClient = {
  site: {
    createSite: {
      mutationOptions: () => ({
        mutation: (input) => createSite(input),
      }),
    },
  },
}

const mocks = { createSite, client }

function resetMocks(): void {
  vi.clearAllMocks()
  mocks.createSite.mockResolvedValue({ id: 'ste_1' })
}

function createController(options: Partial<OrganizationSiteCreationOptions> = {}) {
  const app = createApp({ render: () => null })
  app.use(createPinia())
  app.use(PiniaColada)
  const scope = effectScope()
  let controller: ReturnType<typeof useOrganizationSiteCreation> | undefined

  app.runWithContext(() => {
    scope.run(() => {
      controller = useOrganizationSiteCreation({
        organizationId: ref('org_1'),
        client: mocks.client,
        ...options,
      })
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

describe('useOrganizationSiteCreation', () => {
  it('creates a Site with the scoped input and returns its id', async () => {
    const { controller, scope } = createController()

    const site = await controller.createSite({
      name: 'Marketing site',
      hostname: 'www.example.com',
    })

    expect(mocks.createSite).toHaveBeenCalledWith({
      organizationId: 'org_1',
      name: 'Marketing site',
      hostname: 'www.example.com',
    })
    expect(site).toEqual({ id: 'ste_1' })
    scope.stop()
  })

  it('raises exactly one success toast with the single shared copy', async () => {
    const { controller, scope } = createController()
    await controller.createSite({ name: 'Marketing site', hostname: 'www.example.com' })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(SITE_CREATED_MESSAGE)
    expect(SITE_CREATED_MESSAGE).toBe('Site created.')
    scope.stop()
  })

  it('raises no toast when the create fails', async () => {
    mocks.createSite.mockRejectedValue(
      Object.assign(new Error('A Site with this hostname already exists.'), { code: 'CONFLICT' }),
    )
    const { controller, scope } = createController()
    await controller
      .createSite({ name: 'Marketing site', hostname: 'www.example.com' })
      .catch(() => undefined)

    expect(toast.success).not.toHaveBeenCalled()
    expect(controller.error.value).toMatchObject({
      code: 'CONFLICT',
      message: 'A Site with this hostname already exists.',
    })
    scope.stop()
  })

  it('raises no toast once the scope is disposed before the create settles', async () => {
    const { controller, scope } = createController()
    const pending = controller.createSite({ name: 'Marketing site', hostname: 'www.example.com' })
    scope.stop()
    await pending

    expect(toast.success).not.toHaveBeenCalled()
  })
})
