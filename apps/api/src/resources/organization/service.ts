import type { AuthUser, OrganizationAuthority } from '@cimi/auth'
import {
  SOrganizationCreateInput,
  SOrganizationCreateOutput,
  SOrganizationDeleteInput,
  SOrganizationDeleteOutput,
  SOrganizationEnsurePersonalInput,
  SOrganizationEnsurePersonalOutput,
  SOrganizationGetInput,
  SOrganizationGetOutput,
  SOrganizationListInput,
  SOrganizationListOutput,
  SOrganizationUpdateInput,
  SOrganizationUpdateOutput,
} from '@cimi/contract'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { OrganizationRepository, OrganizationRecord } from './repository.ts'

export interface OrganizationMembershipReconciler {
  reconcile(organizationId: string, headers?: Headers, currentUserId?: string): Promise<void>
}

export interface OrganizationServiceDependencies {
  readonly repository: OrganizationRepository
  readonly authority: OrganizationAuthority
  readonly membership?: OrganizationMembershipReconciler | undefined
}

export class OrganizationService {
  private readonly repository: OrganizationRepository
  private readonly authority: OrganizationAuthority
  private readonly membership: OrganizationMembershipReconciler | undefined

  constructor({ repository, authority, membership }: OrganizationServiceDependencies) {
    this.repository = repository
    this.authority = authority
    this.membership = membership
  }

  async list(
    input: InferOutput<typeof SOrganizationListInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationListOutput>> {
    const page = await this.repository.findManyForUser({
      userId: user.id,
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
    for (const organization of page.items) {
      await this.reconcileOrganization(organization.id, headers, user.id)
      await this.assertReadable(organization.id)
    }
    if (page.items.length === 0) {
      return {
        items: [],
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        totalCount: page.totalCount,
      }
    }
    const refreshed = await this.repository.findManyForUser({
      userId: user.id,
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
    return {
      items: refreshed.items.map(toOrganization),
      nextOffset: refreshed.nextOffset,
      hasMore: refreshed.hasMore,
      totalCount: refreshed.totalCount,
    }
  }

  async get(
    input: InferOutput<typeof SOrganizationGetInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationGetOutput>> {
    await this.reconcileOrganization(input.organizationId, headers, user.id)
    const organization = await this.repository.findByIdForUser(input.organizationId, user.id)
    if (organization === undefined) throw new ORPCError('NOT_FOUND')
    await this.assertReadable(organization.id)
    return toOrganization(organization)
  }

  async ensurePersonal(
    _input: InferOutput<typeof SOrganizationEnsurePersonalInput>,
    user: Pick<AuthUser, 'id' | 'name'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationEnsurePersonalOutput>> {
    const existing = await this.repository.findPersonalByOwner(user.id)
    if (existing !== undefined) {
      await this.reconcileOrganization(existing.id, headers, user.id)
      await this.assertReadable(existing.id)
      return toOrganization(existing)
    }

    const slug = `personal-${user.id}`
    const name = `${user.name}'s Organization`
    let authorityOrganization = await this.authority.getOrganizationBySlug({ slug, headers })
    if (authorityOrganization === undefined) {
      try {
        const created = await this.authority.createOrganization({
          name,
          slug,
          ownerUserId: user.id,
        })
        assertAuthorityOwner(created.organization.id, created.member, user.id)
        authorityOrganization = created.organization
      } catch {
        authorityOrganization = await this.authority.getOrganizationBySlug({ slug, headers })
        if (authorityOrganization === undefined) throw new ORPCError('CONFLICT')
        const member = await this.authority.getMember({
          organizationId: authorityOrganization.id,
          userId: user.id,
          headers,
        })
        if (member === undefined) throw new ORPCError('CONFLICT')
        assertAuthorityOwner(authorityOrganization.id, member, user.id)
      }
    } else {
      const member = await this.authority.getMember({
        organizationId: authorityOrganization.id,
        userId: user.id,
        headers,
      })
      if (member === undefined) throw new ORPCError('CONFLICT')
      assertAuthorityOwner(authorityOrganization.id, member, user.id)
    }

    try {
      const organization = await this.repository.insertWithOwner(
        {
          id: generateId('organization'),
          name: authorityOrganization.name,
          authorityOrganizationId: authorityOrganization.id,
          ownerUserId: user.id,
          isPersonal: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { userId: user.id, now: new Date() },
      )
      return toOrganization(organization)
    } catch (error) {
      const winner = await this.repository.findPersonalByOwner(user.id)
      if (winner !== undefined) return toOrganization(winner)
      if (isConstraintError(error)) throw new ORPCError('CONFLICT')
      throw error
    }
  }

  async create(
    input: InferOutput<typeof SOrganizationCreateInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationCreateOutput>> {
    const authorityOrganization = await this.authority.createOrganization({
      name: input.name,
      slug: `${generateId('organization')}-${user.id}`,
      ownerUserId: user.id,
    })
    assertAuthorityOwner(
      authorityOrganization.organization.id,
      authorityOrganization.member,
      user.id,
    )
    try {
      const organization = await this.repository.insertWithOwner(
        {
          id: generateId('organization'),
          name: input.name,
          authorityOrganizationId: authorityOrganization.organization.id,
          ownerUserId: user.id,
          isPersonal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { userId: user.id, now: new Date() },
      )
      return toOrganization(organization)
    } catch (error) {
      try {
        await this.authority.deleteOrganization({
          organizationId: authorityOrganization.organization.id,
          headers,
        })
      } catch {
        throw new ORPCError('CONFLICT')
      }
      if (isConstraintError(error)) throw new ORPCError('CONFLICT')
      throw error
    }
  }

  async update(
    input: InferOutput<typeof SOrganizationUpdateInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationUpdateOutput>> {
    const organization = await this.requireOrganization(input.organizationId)
    await this.reconcileOrganization(organization.id, headers, user.id)
    await this.assertCommandRole(organization.id, user.id, 'admin')
    const oldName = organization.name
    if (organization.authorityOrganizationId !== null) {
      const updatedAuthority = await this.authority.updateOrganization({
        organizationId: organization.authorityOrganizationId,
        name: input.name,
        headers,
      })
      if (updatedAuthority === undefined || updatedAuthority.name !== input.name) {
        throw new ORPCError('CONFLICT')
      }
      try {
        const updated = await this.repository.updateName(organization.id, input.name)
        if (updated === undefined) throw new ORPCError('NOT_FOUND')
        return toOrganization(updated)
      } catch (error) {
        try {
          await this.authority.updateOrganization({
            organizationId: organization.authorityOrganizationId,
            name: oldName,
            headers,
          })
        } catch {
          throw new ORPCError('CONFLICT')
        }
        if (error instanceof ORPCError) throw error
        throw new ORPCError('CONFLICT')
      }
    }
    const updated = await this.repository.updateName(organization.id, input.name)
    if (updated === undefined) throw new ORPCError('NOT_FOUND')
    return toOrganization(updated)
  }

  async delete(
    input: InferOutput<typeof SOrganizationDeleteInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationDeleteOutput>> {
    const organization = await this.requireOrganization(input.organizationId)
    let operation = await this.repository.findPendingDeleteOperation(organization.id)

    if (operation !== undefined) {
      if (operation.previousOwnerUserId !== user.id) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
    } else {
      await this.reconcileOrganization(organization.id, headers, user.id)
      await this.assertCommandRole(organization.id, user.id, 'owner')
      operation = await this.createDeleteOperation(organization, user.id)
    }

    if (organization.authorityOrganizationId !== null) {
      try {
        await this.repository.incrementDeleteAttempt(operation.id)
        await this.authority.deleteOrganization({
          organizationId: organization.authorityOrganizationId,
          headers,
        })
      } catch (error) {
        await this.recordDeleteFailure(operation.id, error)
        throw new ORPCError('CONFLICT', { status: 409 })
      }
    }

    try {
      if (!(await this.repository.finalizeDeleteOperation(operation.id))) {
        throw new ORPCError('NOT_FOUND')
      }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      await this.recordDeleteFailure(operation.id, error)
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async createDeleteOperation(
    organization: OrganizationRecord,
    userId: string,
  ): Promise<OrganizationRepository.DeleteOperation> {
    try {
      const now = new Date()
      return await this.repository.createDeleteOperation({
        id: generateId('governance-operation'),
        organizationId: organization.id,
        previousOwnerUserId: userId,
        targetUserId: userId,
        requestedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    } catch (error) {
      if (error instanceof Error) {
        switch (error.message) {
          case 'NOT_FOUND':
            throw new ORPCError('NOT_FOUND')
          case 'PERSONAL_PROTECTED':
            throw new ORPCError('PERSONAL_ORGANIZATION_PROTECTED', { status: 409 })
          case 'ORGANIZATION_NOT_EMPTY':
            throw new ORPCError(
              organization.isPersonal
                ? 'PERSONAL_ORGANIZATION_PROTECTED'
                : 'ORGANIZATION_NOT_EMPTY',
              { status: 409 },
            )
          case 'FORBIDDEN_OWNER':
            throw new ORPCError('FORBIDDEN')
          case 'FENCED_PENDING':
          case 'CONFLICT_OWNER':
            throw new ORPCError('CONFLICT', { status: 409 })
        }
      }
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async recordDeleteFailure(operationId: string, error: unknown): Promise<void> {
    try {
      await this.repository.recordDeleteFailure(
        operationId,
        error instanceof Error ? error.message : 'Organization deletion did not complete',
      )
    } catch {
      // Keep the operation pending when failure metadata cannot be recorded.
    }
  }

  private async requireOrganization(id: string): Promise<OrganizationRecord> {
    const organization = await this.repository.findById(id)
    if (organization === undefined) throw new ORPCError('NOT_FOUND')
    return organization
  }

  private async reconcileOrganization(
    organizationId: string,
    headers: Headers,
    userId: string,
  ): Promise<void> {
    if (await this.repository.hasPendingGovernanceOperation(organizationId)) {
      throw new ORPCError('CONFLICT')
    }
    if (this.membership !== undefined) {
      await this.membership.reconcile(organizationId, headers, userId)
    }
  }

  private async assertReadable(organizationId: string): Promise<void> {
    if (!(await this.repository.isOwnerInvariantValid(organizationId))) {
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
  }

  private async assertCommandRole(
    organizationId: string,
    userId: string,
    required: 'admin' | 'owner',
  ): Promise<void> {
    await this.assertReadable(organizationId)
    const role = await this.repository.findRoleForUser(organizationId, userId)
    if (role === undefined) throw new ORPCError('NOT_FOUND')
    const rank = { member: 1, admin: 2, owner: 3 } as const
    if (rank[role] < rank[required]) throw new ORPCError('FORBIDDEN')
  }
}

function toOrganization(record: OrganizationRecord): InferOutput<typeof SOrganizationCreateOutput> {
  return {
    id: record.id,
    name: record.name,
    ownerUserId: record.ownerUserId,
    isPersonal: record.isPersonal,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function assertAuthorityOwner(
  organizationId: string,
  member: { organizationId: string; userId: string; role: string },
  userId: string,
): void {
  if (
    member.organizationId !== organizationId ||
    member.userId !== userId ||
    member.role !== 'owner'
  ) {
    throw new ORPCError('CONFLICT')
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique/i.test(error.message)
}
