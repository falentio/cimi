import type { Auth } from './server.ts'

export type AuthorityRole = 'owner' | 'admin' | 'member'

export interface AuthorityOrganization {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly createdAt: Date
}

export interface AuthorityMember {
  readonly id: string
  readonly organizationId: string
  readonly userId: string
  readonly role: AuthorityRole
  readonly createdAt: Date
}

export interface OrganizationAuthority {
  createOrganization(input: {
    name: string
    slug: string
    ownerUserId: string
  }): Promise<{ organization: AuthorityOrganization; member: AuthorityMember }>
  listOrganizations(input: { userId: string; headers: Headers }): Promise<AuthorityOrganization[]>
  getOrganization(input: {
    organizationId: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined>
  getOrganizationBySlug(input: {
    slug: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined>
  updateOrganization(input: {
    organizationId: string
    name: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined>
  deleteOrganization(input: { organizationId: string; headers: Headers }): Promise<void>
  listMembers(input: {
    organizationId: string
    offset: number
    limit: number
    headers: Headers
  }): Promise<{ members: AuthorityMember[]; totalCount: number }>
  getMember(input: {
    organizationId: string
    userId: string
    headers: Headers
  }): Promise<AuthorityMember | undefined>
  changeMemberRole(input: {
    organizationId: string
    memberId: string
    role: AuthorityRole
    headers: Headers
  }): Promise<AuthorityMember>
  removeMember(input: {
    organizationId: string
    userId: string
    headers: Headers
  }): Promise<AuthorityMember>
  leaveOrganization(input: { organizationId: string; headers: Headers }): Promise<void>
  reconcileOwnership(input: {
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    headers: Headers
  }): Promise<{ previousOwner: AuthorityMember; target: AuthorityMember }>
}

export interface BetterAuthOrganizationAuthorityDependencies {
  readonly auth: Auth
}

export class BetterAuthOrganizationAuthority implements OrganizationAuthority {
  private readonly auth: Auth

  constructor({ auth }: BetterAuthOrganizationAuthorityDependencies) {
    this.auth = auth
  }

  async createOrganization(input: {
    name: string
    slug: string
    ownerUserId: string
  }): Promise<{ organization: AuthorityOrganization; member: AuthorityMember }> {
    const result = await this.auth.api.createOrganization({
      body: { name: input.name, slug: input.slug, userId: input.ownerUserId },
    })
    const member = result.members[0]
    if (member === undefined) throw new Error('Better Auth returned no organization owner')
    return { organization: toOrganization(result), member: toMember(member) }
  }

  async listOrganizations(input: {
    userId: string
    headers: Headers
  }): Promise<AuthorityOrganization[]> {
    void input.userId
    const organizations = await this.auth.api.listOrganizations({ headers: input.headers })
    return organizations.map(toOrganization)
  }

  async getOrganization(input: {
    organizationId: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined> {
    try {
      const organization = await this.auth.api.getOrganization({
        headers: input.headers,
        query: { organizationId: input.organizationId },
      })
      return organization === null ? undefined : toOrganization(organization)
    } catch (error) {
      if (isOrganizationNotFound(error)) return undefined
      throw error
    }
  }

  async getOrganizationBySlug(input: {
    slug: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined> {
    try {
      const organization = await this.auth.api.getOrganization({
        headers: input.headers,
        query: { organizationSlug: input.slug },
      })
      return organization === null ? undefined : toOrganization(organization)
    } catch (error) {
      if (isOrganizationNotFound(error)) return undefined
      throw error
    }
  }

  async updateOrganization(input: {
    organizationId: string
    name: string
    headers: Headers
  }): Promise<AuthorityOrganization | undefined> {
    const organization = await this.auth.api.updateOrganization({
      headers: input.headers,
      body: { organizationId: input.organizationId, data: { name: input.name } },
    })
    return organization === null ? undefined : toOrganization(organization)
  }

  async deleteOrganization(input: { organizationId: string; headers: Headers }): Promise<void> {
    try {
      await this.auth.api.deleteOrganization({
        headers: input.headers,
        body: { organizationId: input.organizationId },
      })
    } catch (error) {
      if (isOrganizationNotFound(error)) return
      throw error
    }
  }

  async listMembers(input: {
    organizationId: string
    offset: number
    limit: number
    headers: Headers
  }): Promise<{ members: AuthorityMember[]; totalCount: number }> {
    const result = await this.auth.api.listMembers({
      headers: input.headers,
      query: { organizationId: input.organizationId, offset: input.offset, limit: input.limit },
    })
    return { members: result.members.map(toMember), totalCount: result.total }
  }

  async getMember(input: {
    organizationId: string
    userId: string
    headers: Headers
  }): Promise<AuthorityMember | undefined> {
    let offset = 0
    const limit = 100
    for (;;) {
      const result = await this.listMembers({
        organizationId: input.organizationId,
        offset,
        limit,
        headers: input.headers,
      })
      const member = result.members.find((candidate) => candidate.userId === input.userId)
      if (member !== undefined) return member
      if (result.members.length === 0 || offset + result.members.length >= result.totalCount) {
        return undefined
      }
      offset += result.members.length
    }
  }

  async changeMemberRole(input: {
    organizationId: string
    memberId: string
    role: AuthorityRole
    headers: Headers
  }): Promise<AuthorityMember> {
    const result = await this.auth.api.updateMemberRole({
      headers: input.headers,
      body: { organizationId: input.organizationId, memberId: input.memberId, role: input.role },
    })
    return toMember(result)
  }

  async removeMember(input: {
    organizationId: string
    userId: string
    headers: Headers
  }): Promise<AuthorityMember> {
    const member = await this.getMember(input)
    if (member === undefined) throw new Error('Better Auth member is unavailable')
    const result = await this.auth.api.removeMember({
      headers: input.headers,
      body: { organizationId: input.organizationId, memberIdOrEmail: member.id },
    })
    return toMember(result.member)
  }

  async leaveOrganization(input: { organizationId: string; headers: Headers }): Promise<void> {
    await this.auth.api.leaveOrganization({
      headers: input.headers,
      body: { organizationId: input.organizationId },
    })
  }

  async reconcileOwnership(input: {
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    headers: Headers
  }): Promise<{ previousOwner: AuthorityMember; target: AuthorityMember }> {
    let previousOwner = await this.getMember({
      organizationId: input.organizationId,
      userId: input.previousOwnerUserId,
      headers: input.headers,
    })
    let target = await this.getMember({
      organizationId: input.organizationId,
      userId: input.targetUserId,
      headers: input.headers,
    })
    if (previousOwner === undefined || target === undefined) {
      throw new Error('Better Auth ownership transfer members are unavailable')
    }

    if (target.role !== 'owner') {
      target = await this.changeMemberRole({
        organizationId: input.organizationId,
        memberId: target.id,
        role: 'owner',
        headers: input.headers,
      })
    }
    if (previousOwner.role !== 'admin') {
      previousOwner = await this.changeMemberRole({
        organizationId: input.organizationId,
        memberId: previousOwner.id,
        role: 'admin',
        headers: input.headers,
      })
    }
    const finalPreviousOwner = await this.getMember({
      organizationId: input.organizationId,
      userId: input.previousOwnerUserId,
      headers: input.headers,
    })
    const finalTarget = await this.getMember({
      organizationId: input.organizationId,
      userId: input.targetUserId,
      headers: input.headers,
    })
    if (
      finalPreviousOwner?.role !== 'admin' ||
      finalTarget?.role !== 'owner' ||
      finalPreviousOwner.organizationId !== input.organizationId ||
      finalTarget.organizationId !== input.organizationId
    ) {
      throw new Error('Better Auth ownership transfer did not converge')
    }
    return { previousOwner: finalPreviousOwner, target: finalTarget }
  }
}

export function createOrganizationAuthority(auth: Auth): OrganizationAuthority {
  return new BetterAuthOrganizationAuthority({ auth })
}

function toOrganization(value: {
  id: string
  name: string
  slug: string
  createdAt: Date
}): AuthorityOrganization {
  return { id: value.id, name: value.name, slug: value.slug, createdAt: value.createdAt }
}

function toMember(value: {
  id: string
  organizationId: string
  userId: string
  role: string
  createdAt: Date
}): AuthorityMember {
  return {
    id: value.id,
    organizationId: value.organizationId,
    userId: value.userId,
    role: toRole(value.role),
    createdAt: value.createdAt,
  }
}

function toRole(value: string): AuthorityRole {
  switch (value) {
    case 'owner':
    case 'admin':
    case 'member':
      return value
    default:
      throw new Error(`Unsupported Better Auth organization role: ${value}`)
  }
}

function isOrganizationNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('body' in error)) return false
  const body = error.body
  if (typeof body !== 'object' || body === null || !('code' in body)) return false
  return body.code === 'ORGANIZATION_NOT_FOUND'
}
