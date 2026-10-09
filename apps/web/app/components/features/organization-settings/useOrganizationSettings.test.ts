import { PiniaColada } from '@pinia/colada'
import { createORPCVueColadaUtils } from '@orpc/vue-colada'
import { createPinia, setActivePinia } from 'pinia'
import { createApp, effectScope, ref } from 'vue'
import { toast } from 'vue-sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationSettingsContainer } from './organization-settings.types'
import { ORGANIZATION_ACTION_MESSAGES } from './organization-settings.utils'
import { useOrganizationSettings } from './useOrganizationSettings'

const getOrganization = vi.fn()

const updateOrganization = vi.fn()

const createOrganization = vi.fn()

const deleteOrganization = vi.fn()

const changeMemberRole = vi.fn()

const removeMember = vi.fn()

const transferOrganizationOwnership = vi.fn()

const leaveOrganization = vi.fn()

const createInvitation = vi.fn()

const revokeInvitation = vi.fn()

const listMembers = vi.fn()

const listInvitations = vi.fn()

const rawClient = {
  organization: { getOrganization, updateOrganization, createOrganization, deleteOrganization },
  membership: {
    changeMemberRole,
    removeMember,
    transferOrganizationOwnership,
    leaveOrganization,
    listMembers,
  },
  invitation: { createInvitation, revokeInvitation, listInvitations },
}

const routerPush = vi.fn()

const clearOrganization = vi.fn()

const stateStore = new Map<string, unknown>()

function useStateStub<T>(key: string, init: () => T) {
  if (!stateStore.has(key)) stateStore.set(key, ref(init()))

  return stateStore.get(key)
}

let app: ReturnType<typeof createApp>

beforeEach(() => {
  stateStore.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.spyOn(toast, 'success')
  const pinia = createPinia()
  setActivePinia(pinia)
  app = createApp({ render: () => null })
  app.use(pinia)
  app.use(PiniaColada)
  vi.stubGlobal('useState', useStateStub)
  vi.stubGlobal('useNuxtApp', () => ({ $orpc: createORPCVueColadaUtils(rawClient) }))
  vi.stubGlobal('useRouter', () => ({ push: routerPush }))
  vi.stubGlobal('useWorkspaceSelection', () => ({
    activeOrganizationId: ref('org-1'),
    isLoading: ref(false),
    selectOrganization: vi.fn(),
    clearOrganization,
  }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function createController(section: 'general' | 'members' | 'danger' = 'members') {
  const scope = effectScope()
  let controller: OrganizationSettingsContainer | undefined
  app.runWithContext(() => {
    scope.run(() => {
      controller = useOrganizationSettings({ section, organizationId: ref('org-1') })
    })
  })

  if (controller === undefined) throw new Error('Controller was not created.')

  return { controller, scope }
}

describe('useOrganizationSettings success toasts', () => {
  it('raises one toast with the shared copy when the organization name is saved', async () => {
    const { controller, scope } = createController('general')
    await controller.updateName({ name: 'Northstar' })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.updateName)
    scope.stop()
  })

  it('raises one toast when ownership is transferred', async () => {
    const { controller, scope } = createController()
    await controller.transferOwnership('user-2')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.transferOwnership)
    scope.stop()
  })

  it('raises one toast when a member role changes', async () => {
    const { controller, scope } = createController()
    await controller.changeMemberRole({ userId: 'user-2', role: 'admin' })

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.changeMemberRole)
    scope.stop()
  })

  it('raises one toast when a member is removed', async () => {
    const { controller, scope } = createController()
    await controller.removeMember('user-2')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.removeMember)
    scope.stop()
  })

  it('raises the toast before navigating away when leaving an organization', async () => {
    const { controller, scope } = createController()
    await controller.leaveOrganization()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.leaveOrganization)
    expect(routerPush).toHaveBeenCalledWith('/')
    scope.stop()
  })

  it('raises one toast when an invitation is created', async () => {
    const { controller, scope } = createController()
    await controller.createInvitation('member')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.createInvitation)
    scope.stop()
  })

  it('raises one toast when an invitation is revoked', async () => {
    const { controller, scope } = createController()
    await controller.revokeInvitation('inv-1')

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.revokeInvitation)
    scope.stop()
  })

  it('raises the toast before navigating away when an organization is deleted', async () => {
    const { controller, scope } = createController('danger')
    await controller.deleteOrganization()

    expect(toast.success).toHaveBeenCalledTimes(1)
    expect(toast.success).toHaveBeenCalledWith(ORGANIZATION_ACTION_MESSAGES.deleteOrganization)
    expect(routerPush).toHaveBeenCalledWith('/')
    scope.stop()
  })

  it('raises no toast when a mutation rejects, leaving the inline error surface', async () => {
    removeMember.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = createController()
    await expect(controller.removeMember('user-2')).rejects.toBeDefined()

    expect(toast.success).not.toHaveBeenCalled()
    expect(controller.error.value).toBeDefined()
    scope.stop()
  })

  it('raises no toast when a navigating mutation rejects', async () => {
    deleteOrganization.mockRejectedValue({ code: 'CONFLICT', status: 409 })
    const { controller, scope } = createController('danger')
    await expect(controller.deleteOrganization()).rejects.toBeDefined()

    expect(toast.success).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    scope.stop()
  })

  it('raises no toast once the scope is disposed before the mutation settles', async () => {
    let resolveLeave: () => void = () => undefined

    const pendingLeave = new Promise<void>((resolve) => {
      resolveLeave = resolve
    })

    leaveOrganization.mockReturnValue(pendingLeave)
    const { controller, scope } = createController()
    const pending = controller.leaveOrganization()
    scope.stop()
    resolveLeave()
    await pending

    expect(toast.success).not.toHaveBeenCalled()
  })
})
