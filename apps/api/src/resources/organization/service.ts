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
    const organization = await this.repository.findByIdForUser(input.organizationId, user.id)
    if (organization === undefined) throw new ORPCError('NOT_FOUND')
    await this.reconcileOrganization(organization.id, headers, user.id)
    const refreshed = await this.repository.findByIdForUser(input.organizationId, user.id)
    if (refreshed === undefined) throw new ORPCError('NOT_FOUND')
    await this.assertReadable(refreshed.id)
    return toOrganization(refreshed)
  }

  async ensurePersonal(
    _input: InferOutput<typeof SOrganizationEnsurePersonalInput>,
    user: Pick<AuthUser, 'id' | 'name'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationEnsurePersonalOutput>> {
    const existing = await this.repository.findPersonalByOwner(user.id)
    if (existing !== undefined) return this.reusePersonal(existing, user.id, headers)

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
        authorityOrganization = created.organization
        const members = await this.authority.listAllMembers({
          organizationId: authorityOrganization.id,
          headers,
        })
        assertAuthorityOwner(authorityOrganization.id, members, user.id)
      } catch {
        authorityOrganization = await this.authority.getOrganizationBySlug({ slug, headers })
        if (authorityOrganization === undefined) throw new ORPCError('CONFLICT')
        const members = await this.authority.listAllMembers({
          organizationId: authorityOrganization.id,
          headers,
        })
        assertAuthorityOwner(authorityOrganization.id, members, user.id)
      }
    } else {
      const members = await this.authority.listAllMembers({
        organizationId: authorityOrganization.id,
        headers,
      })
      assertAuthorityOwner(authorityOrganization.id, members, user.id)
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
      if (winner !== undefined) return this.reusePersonal(winner, user.id, headers)
      if (isConstraintError(error)) throw new ORPCError('CONFLICT')
      throw error
    }
  }

  private async reusePersonal(
    organization: OrganizationRecord,
    userId: string,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationEnsurePersonalOutput>> {
    await this.reconcileOrganization(organization.id, headers, userId)
    await this.assertReadable(organization.id)
    return toOrganization(organization)
  }

  async create(
    input: InferOutput<typeof SOrganizationCreateInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationCreateOutput>> {
    let repair: OrganizationRepository.RepairOperation | undefined
    try {
      repair = await this.repository.findPendingCreateRepair(user.id)
      if (repair !== undefined) {
        if (repair.desiredName !== input.name) throw new ORPCError('CONFLICT')
      } else {
        const now = new Date()
        const localOrganizationId = generateId('organization')
        repair = await this.repository.createRepairOperation({
          id: generateId('organization-repair'),
          organizationId: null,
          localOrganizationId,
          operationType: 'create-organization',
          ownerUserId: user.id,
          authorityOrganizationId: null,
          authorityCleanupRequired: false,
          authoritySlug: `${localOrganizationId}-${user.id}`,
          previousName: null,
          desiredName: input.name,
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw new ORPCError('CONFLICT')
    }
    return toOrganization(await this.reconcileCreateRepair(repair, user.id, headers))
  }

  private async reconcileCreateRepair(
    repair: OrganizationRepository.RepairOperation,
    userId: string,
    headers: Headers,
  ): Promise<OrganizationRecord> {
    let authorityOrganizationId = repair.authorityOrganizationId
    let localOrganizationMaterialized = false
    let authorityCreatedInAttempt = repair.authorityCleanupRequired
    try {
      await this.repository.incrementRepairAttempt(repair.id)
      const authoritySlug = requireAuthoritySlug(repair)
      if (authorityOrganizationId === null) {
        const existingAuthority = await this.authority.getOrganizationBySlug({
          slug: authoritySlug,
          headers,
        })
        if (existingAuthority !== undefined) {
          authorityOrganizationId = existingAuthority.id
          await this.repository.setRepairAuthorityOrganization(
            repair.id,
            authorityOrganizationId,
            authorityCreatedInAttempt,
          )
          const members = await this.authority.listAllMembers({
            organizationId: authorityOrganizationId,
            headers,
          })
          assertAuthorityOwner(authorityOrganizationId, members, userId)
        } else {
          await this.repository.setRepairAuthorityCleanupRequired(repair.id)
          authorityCreatedInAttempt = true
          const created = await this.authority.createOrganization({
            name: repair.desiredName,
            slug: authoritySlug,
            ownerUserId: userId,
          })
          authorityOrganizationId = created.organization.id
          authorityCreatedInAttempt = true
          await this.repository.setRepairAuthorityOrganization(
            repair.id,
            authorityOrganizationId,
            true,
          )
          assertCreatedAuthorityOwner(authorityOrganizationId, created.member, userId)
        }
      } else {
        const members = await this.authority.listAllMembers({
          organizationId: authorityOrganizationId,
          headers,
        })
        assertAuthorityOwner(authorityOrganizationId, members, userId)
      }

      const existingLocal = await this.repository.findById(repair.localOrganizationId)
      if (existingLocal !== undefined) {
        if (
          existingLocal.name !== repair.desiredName ||
          existingLocal.ownerUserId !== userId ||
          existingLocal.authorityOrganizationId !== authorityOrganizationId ||
          existingLocal.isPersonal
        ) {
          throw new Error('Organization create repair local state is invalid')
        }
        localOrganizationMaterialized = true
        try {
          if (!(await this.repository.completeRepairOperation(repair.id))) {
            throw new Error('Organization repair completion failed')
          }
        } catch (completionError) {
          await this.recordRepairFailure(repair.id, completionError)
          throw new ORPCError('CONFLICT')
        }
        return existingLocal
      }
      const createdLocal = await this.repository.insertWithOwnerAndCompleteRepair(
        {
          id: repair.localOrganizationId,
          name: repair.desiredName,
          authorityOrganizationId,
          ownerUserId: userId,
          isPersonal: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        { userId, now: new Date() },
        repair.id,
      )
      localOrganizationMaterialized = true
      return createdLocal
    } catch (error) {
      if (
        authorityCreatedInAttempt &&
        authorityOrganizationId !== null &&
        !localOrganizationMaterialized
      ) {
        try {
          await this.authority.deleteOrganization({
            organizationId: authorityOrganizationId,
            headers,
          })
          if (!(await this.repository.completeRepairOperation(repair.id))) {
            throw new Error('Organization repair completion failed')
          }
        } catch (compensationError) {
          await this.recordRepairFailure(repair.id, compensationError)
          throw new ORPCError('CONFLICT')
        }
      } else {
        await this.recordRepairFailure(repair.id, error)
      }
      if (error instanceof ORPCError) throw error
      if (isConstraintError(error)) throw new ORPCError('CONFLICT')
      throw error
    }
  }

  private async assertUpdateRepairRecoverable(
    repair: OrganizationRepository.RepairOperation,
    userId: string,
    headers: Headers,
  ): Promise<void> {
    await this.assertCommandRole(repair.localOrganizationId, userId, 'admin')
    const authorityMember = await this.authority.getMember({
      organizationId: repair.authorityOrganizationId!,
      userId,
      headers,
    })
    if (authorityMember === undefined || authorityMember.role === 'member') {
      throw new ORPCError('FORBIDDEN')
    }
  }

  private async recordRepairFailure(repairId: string, error: unknown): Promise<void> {
    try {
      await this.repository.recordRepairFailure(
        repairId,
        error instanceof Error ? error.message : 'Organization repair did not complete',
      )
    } catch {
      // Keep the repair pending when failure metadata cannot be recorded.
    }
  }

  private async reconcileUpdateRepair(
    repair: OrganizationRepository.RepairOperation,
    headers: Headers,
  ): Promise<OrganizationRecord> {
    if (repair.authorityOrganizationId === null || repair.previousName === null) {
      throw new ORPCError('CONFLICT')
    }
    await this.repository.incrementRepairAttempt(repair.id)
    let authorityMutationAttempted = false
    try {
      const currentAuthority = await this.authority.getOrganization({
        organizationId: repair.authorityOrganizationId,
        headers,
      })
      if (currentAuthority === undefined) throw new Error('Authority Organization is unavailable')
      if (currentAuthority.name !== repair.desiredName) {
        authorityMutationAttempted = true
        const updatedAuthority = await this.authority.updateOrganization({
          organizationId: repair.authorityOrganizationId,
          name: repair.desiredName,
          headers,
        })
        if (updatedAuthority === undefined || updatedAuthority.name !== repair.desiredName) {
          throw new Error('Organization name update did not converge')
        }
      }
      const updated = await this.repository.updateNameAndCompleteRepair(
        repair.localOrganizationId,
        repair.desiredName,
        repair.id,
      )
      if (updated === undefined) throw new ORPCError('NOT_FOUND')
      return updated
    } catch (error) {
      if (authorityMutationAttempted) {
        try {
          const restored = await this.authority.updateOrganization({
            organizationId: repair.authorityOrganizationId,
            name: repair.previousName,
            headers,
          })
          if (restored === undefined || restored.name !== repair.previousName) {
            throw new Error('Organization name rollback did not converge')
          }
        } catch (compensationError) {
          await this.recordRepairFailure(repair.id, compensationError)
          throw new ORPCError('CONFLICT')
        }
      }
      await this.recordRepairFailure(repair.id, error)
      if (error instanceof ORPCError) throw error
      throw new ORPCError('CONFLICT')
    }
  }

  async update(
    input: InferOutput<typeof SOrganizationUpdateInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SOrganizationUpdateOutput>> {
    const organization = await this.requireOrganizationForUser(input.organizationId, user.id)
    const pendingRepair = await this.repository.findPendingUpdateRepair(organization.id)
    if (pendingRepair !== undefined) {
      await this.assertUpdateRepairRecoverable(pendingRepair, user.id, headers)
      if (pendingRepair.desiredName !== input.name) throw new ORPCError('CONFLICT')
      return toOrganization(await this.reconcileUpdateRepair(pendingRepair, headers))
    }
    await this.reconcileOrganization(organization.id, headers, user.id)
    await this.assertCommandRole(organization.id, user.id, 'admin')
    if (organization.authorityOrganizationId !== null) {
      const now = new Date()
      let repair: OrganizationRepository.RepairOperation
      try {
        repair = await this.repository.createRepairOperation({
          id: generateId('organization-repair'),
          organizationId: organization.id,
          localOrganizationId: organization.id,
          operationType: 'update-organization',
          ownerUserId: user.id,
          authorityOrganizationId: organization.authorityOrganizationId,
          authorityCleanupRequired: false,
          authoritySlug: null,
          previousName: organization.name,
          desiredName: input.name,
          requestedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      } catch {
        throw new ORPCError('CONFLICT')
      }
      return toOrganization(await this.reconcileUpdateRepair(repair, headers))
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
    const organization = await this.requireOrganizationForUser(input.organizationId, user.id)
    await this.assertCommandRole(organization.id, user.id, 'owner')
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

  private async requireOrganizationForUser(
    id: string,
    userId: string,
  ): Promise<OrganizationRecord> {
    const organization = await this.repository.findByIdForUser(id, userId)
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

function requireAuthoritySlug(repair: OrganizationRepository.RepairOperation): string {
  if (repair.authoritySlug === null) {
    throw new Error('Organization create repair is missing authority slug')
  }
  return repair.authoritySlug
}

function assertCreatedAuthorityOwner(
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

function assertAuthorityOwner(
  organizationId: string,
  members: Array<{ organizationId: string; userId: string; role: string }>,
  userId: string,
): void {
  const owners = members.filter((member) => member.role === 'owner')
  if (
    owners.length !== 1 ||
    owners[0]?.organizationId !== organizationId ||
    owners[0]?.userId !== userId ||
    members.some((member) => member.organizationId !== organizationId) ||
    new Set(members.map((member) => member.userId)).size !== members.length
  ) {
    throw new ORPCError('CONFLICT')
  }
}

function isConstraintError(error: unknown): boolean {
  return error instanceof Error && /constraint|unique/i.test(error.message)
}
