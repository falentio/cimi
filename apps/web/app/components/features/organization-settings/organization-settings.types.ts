import type { CimiOrpc } from '~/plugins/orpc'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'

export type Organization = Awaited<ReturnType<CimiOrpc['organization']['getOrganization']['call']>>
export type OrganizationId = Organization['id']
export type OrganizationNameInput = Pick<
  Parameters<CimiOrpc['organization']['updateOrganization']['call']>[0],
  'name'
>
export type OrganizationCreateInput = Parameters<
  CimiOrpc['organization']['createOrganization']['call']
>[0]
export type OrganizationMember = Awaited<
  ReturnType<CimiOrpc['membership']['listMembers']['call']>
>['items'][number]
export type OrganizationInvitation = Awaited<
  ReturnType<CimiOrpc['invitation']['listInvitations']['call']>
>['items'][number]
export type CreatedInvitation = Awaited<
  ReturnType<CimiOrpc['invitation']['createInvitation']['call']>
>
export type EditableMemberRole = Exclude<OrganizationMember['role'], 'owner'>

export interface OffsetCollection<TItem> {
  readonly items: readonly TItem[]
  readonly totalCount: number
}

export interface SettingsError {
  readonly code?: string
  readonly message: string
}

export interface OrganizationSettingsSnapshot {
  readonly section: 'general' | 'members' | 'danger'
  readonly activeOrganizationId: OrganizationId | undefined
  readonly currentUserId: string | undefined
  readonly organization: Organization | undefined
  readonly members: OffsetCollection<OrganizationMember> | undefined
  readonly invitations: OffsetCollection<OrganizationInvitation> | undefined
  readonly currentMembership: OrganizationMember | undefined
  readonly isOwner: boolean
  readonly isLoading: boolean
  readonly isMutating: boolean
  readonly error: SettingsError | undefined
}

export interface OrganizationSettingsOptions {
  readonly section: 'general' | 'members' | 'danger'
  readonly organizationId: MaybeRefOrGetter<OrganizationId | undefined>
}

export interface OrganizationCreationOptions {
  readonly section: 'create'
}

export interface OrganizationSettingsContainer {
  readonly snapshot: Readonly<ComputedRef<OrganizationSettingsSnapshot>>
  readonly isMutating: Readonly<ComputedRef<boolean>>
  readonly error: Readonly<ComputedRef<SettingsError | undefined>>
  refresh(): Promise<void>
  updateName(input: OrganizationNameInput): Promise<Organization>
  changeMemberRole(input: {
    readonly userId: OrganizationMember['userId']
    readonly role: EditableMemberRole
  }): Promise<OrganizationMember>
  removeMember(userId: OrganizationMember['userId']): Promise<void>
  transferOwnership(userId: OrganizationMember['userId']): Promise<OrganizationMember>
  leaveOrganization(): Promise<void>
  createInvitation(role: EditableMemberRole): Promise<CreatedInvitation>
  revokeInvitation(invitationId: OrganizationInvitation['id']): Promise<void>
  deleteOrganization(): Promise<void>
}

export interface OrganizationCreationContainer {
  readonly isCreating: Readonly<ComputedRef<boolean>>
  readonly error: Readonly<ComputedRef<SettingsError | undefined>>
  createOrganization(input: OrganizationCreateInput): Promise<Organization>
}
