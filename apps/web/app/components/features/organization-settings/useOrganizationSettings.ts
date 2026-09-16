import { useMutation, useQuery, useQueryCache, type EntryKey } from '@pinia/colada'
import { computed, toValue } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useOrpc } from '@/composables/useOrpc'
import {
  normalizeOrganizationNameDraft,
  normalizeSettingsError,
} from './organization-settings.utils'
import type {
  CreatedInvitation,
  EditableMemberRole,
  OffsetCollection,
  Organization,
  OrganizationCreateInput,
  OrganizationCreationContainer,
  OrganizationCreationOptions,
  OrganizationInvitation,
  OrganizationId,
  OrganizationMember,
  OrganizationMemberRoleUpdate,
  OrganizationNameInput,
  OrganizationOwnershipTransfer,
  OrganizationSettingsContainer,
  OrganizationSettingsOptions,
  OrganizationSettingsSnapshot,
  SettingsError,
} from './organization-settings.types'

const SETTINGS_QUERY_KEY = ['organization-settings'] as const
const WORKSPACE_QUERY_KEY = ['workspace'] as const
const PAGE_SIZE = 100

export function useOrganizationSettings(
  options: OrganizationSettingsOptions,
): OrganizationSettingsContainer
export function useOrganizationSettings(
  options: OrganizationCreationOptions,
): OrganizationCreationContainer
export function useOrganizationSettings(
  options: OrganizationSettingsOptions | OrganizationCreationOptions,
): OrganizationSettingsContainer | OrganizationCreationContainer {
  const { session } = useAuth()
  const orpc = useOrpc()
  const queryCache = useQueryCache()
  const router = useRouter()
  const workspaceSelection = options.section === 'create' ? undefined : useWorkspaceSelection()
  const authenticated = computed(() => session.value.status === 'authenticated')
  const currentUserId = computed(() => {
    const state = session.value
    return state.status === 'authenticated' ? state.session.user.id : undefined
  })
  const activeOrganizationId = computed<OrganizationId | undefined>(() => {
    if (options.section === 'create') return undefined
    return toValue(options.organizationId)
  })
  const organizationKey = computed(() => [
    ...SETTINGS_QUERY_KEY,
    'organization',
    currentUserId.value ?? null,
    activeOrganizationId.value ?? null,
  ])

  const organizationQuery = useQuery<Organization, unknown>({
    key: organizationKey,
    enabled: computed(() => authenticated.value && activeOrganizationId.value !== undefined),
    query: ({ signal }) =>
      orpc.organization.getOrganization.call(
        { organizationId: requireOrganizationId(activeOrganizationId.value) },
        { signal },
      ),
  })

  const membersKey = computed(() => [
    ...SETTINGS_QUERY_KEY,
    'members',
    currentUserId.value ?? null,
    activeOrganizationId.value ?? null,
  ])
  const membersQuery = useQuery<OffsetCollection<OrganizationMember>, unknown>({
    key: membersKey,
    enabled: computed(
      () =>
        authenticated.value &&
        options.section === 'members' &&
        activeOrganizationId.value !== undefined,
    ),
    query: ({ signal }) =>
      loadAllPages((offset) =>
        orpc.membership.listMembers.call(
          {
            organizationId: requireOrganizationId(activeOrganizationId.value),
            offset,
            limit: PAGE_SIZE,
          },
          { signal },
        ),
      ),
  })

  const currentMembership = computed(() =>
    membersQuery.data.value?.items.find((member) => member.userId === currentUserId.value),
  )
  const invitationsKey = computed(() => [
    ...SETTINGS_QUERY_KEY,
    'invitations',
    currentUserId.value ?? null,
    activeOrganizationId.value ?? null,
  ])
  const invitationsQuery = useQuery<OffsetCollection<OrganizationInvitation>, unknown>({
    key: invitationsKey,
    enabled: computed(() => {
      const role = currentMembership.value?.role
      return (
        authenticated.value &&
        options.section === 'members' &&
        activeOrganizationId.value !== undefined &&
        (role === 'owner' || role === 'admin')
      )
    }),
    query: ({ signal }) =>
      loadAllPages((offset) =>
        orpc.invitation.listInvitations.call(
          {
            organizationId: requireOrganizationId(activeOrganizationId.value),
            offset,
            limit: PAGE_SIZE,
          },
          { signal },
        ),
      ),
  })

  const updateNameMutation = useMutation(orpc.organization.updateOrganization.mutationOptions())
  const createOrganizationMutation = useMutation(
    orpc.organization.createOrganization.mutationOptions(),
  )
  const changeMemberRoleMutation = useMutation(orpc.membership.changeMemberRole.mutationOptions())
  const removeMemberMutation = useMutation(orpc.membership.removeMember.mutationOptions())
  const transferOwnershipMutation = useMutation(
    orpc.membership.transferOrganizationOwnership.mutationOptions(),
  )
  const leaveOrganizationMutation = useMutation(orpc.membership.leaveOrganization.mutationOptions())
  const createInvitationMutation = useMutation(orpc.invitation.createInvitation.mutationOptions())
  const revokeInvitationMutation = useMutation(orpc.invitation.revokeInvitation.mutationOptions())
  const deleteOrganizationMutation = useMutation(
    orpc.organization.deleteOrganization.mutationOptions(),
  )

  const queryError = computed<SettingsError | undefined>(() =>
    organizationQuery.error.value !== null
      ? normalizeSettingsError(organizationQuery.error.value)
      : membersQuery.error.value !== null
        ? normalizeSettingsError(membersQuery.error.value)
        : invitationsQuery.error.value !== null
          ? normalizeSettingsError(invitationsQuery.error.value)
          : undefined,
  )
  const mutationError = computed<SettingsError | undefined>(() => {
    const error =
      updateNameMutation.error.value ??
      createOrganizationMutation.error.value ??
      changeMemberRoleMutation.error.value ??
      removeMemberMutation.error.value ??
      transferOwnershipMutation.error.value ??
      leaveOrganizationMutation.error.value ??
      createInvitationMutation.error.value ??
      revokeInvitationMutation.error.value ??
      deleteOrganizationMutation.error.value
    return error === null ? undefined : normalizeSettingsError(error)
  })
  const error = computed<SettingsError | undefined>(() => mutationError.value ?? queryError.value)
  const isMutating = computed(
    () =>
      updateNameMutation.isLoading.value ||
      createOrganizationMutation.isLoading.value ||
      changeMemberRoleMutation.isLoading.value ||
      removeMemberMutation.isLoading.value ||
      transferOwnershipMutation.isLoading.value ||
      leaveOrganizationMutation.isLoading.value ||
      createInvitationMutation.isLoading.value ||
      revokeInvitationMutation.isLoading.value ||
      deleteOrganizationMutation.isLoading.value,
  )

  async function refresh(): Promise<void> {
    const refreshes: Promise<unknown>[] = []
    if (activeOrganizationId.value !== undefined) refreshes.push(organizationQuery.refetch())
    if (options.section === 'members' && activeOrganizationId.value !== undefined) {
      refreshes.push(membersQuery.refetch())
      if (invitationsQuery.status.value !== 'pending') refreshes.push(invitationsQuery.refetch())
    }
    await Promise.all(refreshes)
  }

  async function updateName(input: OrganizationNameInput): Promise<Organization> {
    const name = normalizeOrganizationNameDraft(input.name)
    if (name === null) throw new Error('Enter an organization name.')

    const organizationId = requireOrganizationId(activeOrganizationId.value)
    const organizationKeyValue = organizationKey.value
    resetMutationErrors()
    const organization = await updateNameMutation.mutateAsync({
      organizationId,
      name,
    })
    await Promise.all([
      queryCache.invalidateQueries({ key: organizationKeyValue, exact: true }),
      queryCache.invalidateQueries({ key: WORKSPACE_QUERY_KEY }),
    ])
    return organization
  }

  async function changeMemberRole(input: {
    readonly userId: OrganizationMember['userId']
    readonly role: EditableMemberRole
  }): Promise<OrganizationMemberRoleUpdate> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    const membersKeyValue = membersKey.value
    const invitationsKeyValue = invitationsKey.value
    resetMutationErrors()
    const member = await changeMemberRoleMutation.mutateAsync({
      organizationId,
      userId: input.userId,
      role: input.role,
    })
    await invalidateSettingsQueries(queryCache, {
      membersKey: membersKeyValue,
      invitationsKey: invitationsKeyValue,
    })
    return member
  }

  async function removeMember(userId: OrganizationMember['userId']): Promise<void> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    const membersKeyValue = membersKey.value
    const invitationsKeyValue = invitationsKey.value
    resetMutationErrors()
    await removeMemberMutation.mutateAsync({
      organizationId,
      userId,
    })
    await invalidateSettingsQueries(queryCache, {
      membersKey: membersKeyValue,
      invitationsKey: invitationsKeyValue,
    })
  }

  async function transferOwnership(
    userId: OrganizationMember['userId'],
  ): Promise<OrganizationOwnershipTransfer> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    const organizationKeyValue = organizationKey.value
    const membersKeyValue = membersKey.value
    const invitationsKeyValue = invitationsKey.value
    resetMutationErrors()
    const member = await transferOwnershipMutation.mutateAsync({
      organizationId,
      userId,
    })
    await invalidateSettingsQueries(queryCache, {
      organizationKey: organizationKeyValue,
      membersKey: membersKeyValue,
      invitationsKey: invitationsKeyValue,
      workspaceKey: WORKSPACE_QUERY_KEY,
    })
    return member
  }

  async function leaveOrganization(): Promise<void> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    resetMutationErrors()
    await leaveOrganizationMutation.mutateAsync({ organizationId })
    workspaceSelection?.clearOrganization(organizationId)
    await invalidateSettingsQueries(queryCache, { workspaceKey: WORKSPACE_QUERY_KEY })
    await router.push('/')
  }

  async function createInvitation(role: EditableMemberRole): Promise<CreatedInvitation> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    const invitationsKeyValue = invitationsKey.value
    resetMutationErrors()
    const invitation = await createInvitationMutation.mutateAsync({
      organizationId,
      role,
    })
    await invalidateSettingsQueries(queryCache, { invitationsKey: invitationsKeyValue })
    return invitation
  }

  async function revokeInvitation(invitationId: OrganizationInvitation['id']): Promise<void> {
    const invitationsKeyValue = invitationsKey.value
    resetMutationErrors()
    await revokeInvitationMutation.mutateAsync({ invitationId })
    await invalidateSettingsQueries(queryCache, { invitationsKey: invitationsKeyValue })
  }

  async function deleteOrganization(): Promise<void> {
    const organizationId = requireOrganizationId(activeOrganizationId.value)
    resetMutationErrors()
    await deleteOrganizationMutation.mutateAsync({ organizationId })
    workspaceSelection?.clearOrganization(organizationId)
    await invalidateSettingsQueries(queryCache, { workspaceKey: WORKSPACE_QUERY_KEY })
    await router.push('/')
  }

  async function createOrganization(input: OrganizationCreateInput): Promise<Organization> {
    const name = normalizeOrganizationNameDraft(input.name)
    if (name === null) throw new Error('Enter an organization name.')

    resetMutationErrors()
    const organization = await createOrganizationMutation.mutateAsync({ name })
    await queryCache.invalidateQueries({ key: WORKSPACE_QUERY_KEY })
    return organization
  }

  function resetMutationErrors(): void {
    updateNameMutation.reset()
    createOrganizationMutation.reset()
    changeMemberRoleMutation.reset()
    removeMemberMutation.reset()
    transferOwnershipMutation.reset()
    leaveOrganizationMutation.reset()
    createInvitationMutation.reset()
    revokeInvitationMutation.reset()
    deleteOrganizationMutation.reset()
  }

  const settingsContainer: OrganizationSettingsContainer = {
    snapshot: computed<OrganizationSettingsSnapshot>(() => ({
      section: options.section === 'create' ? 'general' : options.section,
      activeOrganizationId: activeOrganizationId.value,
      currentUserId: currentUserId.value,
      organization: organizationQuery.data.value,
      members: membersQuery.data.value,
      invitations: invitationsQuery.data.value,
      currentMembership: currentMembership.value,
      isOwner:
        organizationQuery.data.value?.ownerUserId !== undefined &&
        organizationQuery.data.value.ownerUserId === currentUserId.value,
      isLoading:
        organizationQuery.isLoading.value ||
        membersQuery.isLoading.value ||
        invitationsQuery.isLoading.value,
      isMutating: isMutating.value,
      error: error.value,
    })),
    isMutating,
    error,
    refresh,
    updateName,
    changeMemberRole,
    removeMember,
    transferOwnership,
    leaveOrganization,
    createInvitation,
    revokeInvitation,
    deleteOrganization,
  }

  const creationContainer: OrganizationCreationContainer = {
    isCreating: createOrganizationMutation.isLoading,
    error,
    createOrganization,
  }

  return options.section === 'create' ? creationContainer : settingsContainer
}

async function invalidateSettingsQueries(
  queryCache: ReturnType<typeof useQueryCache>,
  options: {
    readonly organizationKey?: EntryKey
    readonly membersKey?: EntryKey
    readonly invitationsKey?: EntryKey
    readonly workspaceKey?: EntryKey
  },
): Promise<void> {
  const keys = [
    options.organizationKey,
    options.membersKey,
    options.invitationsKey,
    options.workspaceKey,
  ].filter((key): key is EntryKey => key !== undefined)
  await Promise.all(keys.map((key) => queryCache.invalidateQueries({ key, exact: true })))
}

async function loadAllPages<TItem>(
  fetchPage: (offset: number) => Promise<{
    readonly items: readonly TItem[]
    readonly nextOffset: number | null
    readonly hasMore: boolean
    readonly totalCount: number
  }>,
): Promise<OffsetCollection<TItem>> {
  const items: TItem[] = []
  let offset = 0
  let totalCount = 0

  while (true) {
    const page = await fetchPage(offset)
    items.push(...page.items)
    totalCount = page.totalCount
    if (!page.hasMore || page.nextOffset === null) return { items, totalCount }
    offset = page.nextOffset
  }
}

function requireOrganizationId(value: OrganizationId | undefined): OrganizationId {
  if (value === undefined) throw new Error('Select an organization before loading its settings.')
  return value
}
