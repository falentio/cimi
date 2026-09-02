import type { AuthUser, AuthorityMember, OrganizationAuthority } from '@cimi/auth'
import {
  SMembershipChangeRoleInput,
  SMembershipChangeRoleOutput,
  SMembershipLeaveInput,
  SMembershipLeaveOutput,
  SMembershipListInput,
  SMembershipListOutput,
  SMembershipRemoveInput,
  SMembershipRemoveOutput,
  SMembershipTransferOwnershipInput,
  SMembershipTransferOwnershipOutput,
} from '@cimi/contract'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { MembershipRecord, MembershipRepository } from './repository.ts'

type MembershipAuthorityPort = Pick<
  OrganizationAuthority,
  'getMember' | 'changeMemberRole' | 'removeMember' | 'leaveOrganization'
>
type MembershipAuthorityMember = NonNullable<
  Awaited<ReturnType<MembershipAuthorityPort['getMember']>>
>

export interface MembershipServiceDependencies {
  readonly repository: MembershipRepository
  readonly authority: OrganizationAuthority
}

export class MembershipService {
  private readonly repository: MembershipRepository
  private readonly authority: OrganizationAuthority

  constructor({ repository, authority }: MembershipServiceDependencies) {
    this.repository = repository
    this.authority = authority
  }

  async reconcile(
    organizationId: string,
    headers?: Headers,
    currentUserId?: string,
  ): Promise<void> {
    await this.reconcileMembershipState(organizationId, headers, currentUserId)
  }

  private async reconcileMembershipState(
    organizationId: string,
    headers?: Headers,
    currentUserId?: string,
  ): Promise<MembershipRepository.MembershipOperation | undefined> {
    if (headers === undefined) throw new ORPCError('INTERNAL_SERVER_ERROR')
    const operation = await this.reconcilePendingMembershipOperation(
      organizationId,
      headers,
      currentUserId,
    )
    if (!(await this.reconcileCurrentUserAccess(organizationId, headers, currentUserId))) {
      return operation
    }
    await this.reconcileAuthorityMembers(organizationId, headers)
    return operation
  }

  async list(
    input: InferOutput<typeof SMembershipListInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipListOutput>> {
    try {
      await this.reconcile(input.organizationId, headers, user.id)
      await this.assertMember(input.organizationId, user.id, 'NOT_FOUND')
      const page = await this.repository.findMany({
        organizationId: input.organizationId,
        offset: input.offset ?? 0,
        limit: input.limit ?? 20,
      })
      return {
        items: page.items.map(toPublicMembership),
        nextOffset: page.nextOffset,
        hasMore: page.hasMore,
        totalCount: page.totalCount,
      }
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
  }

  async changeRole(
    input: InferOutput<typeof SMembershipChangeRoleInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipChangeRoleOutput>> {
    await this.reconcile(input.organizationId, headers, user.id)
    await this.assertOrganizationCommandAvailable(input.organizationId)
    const actor = await this.assertMember(input.organizationId, user.id, 'FORBIDDEN')
    if (actor.role === 'member') throw new ORPCError('FORBIDDEN')

    const target = await this.repository.findById({
      organizationId: input.organizationId,
      userId: input.userId,
    })
    if (target === undefined) throw new ORPCError('NOT_FOUND')
    if (target.role === 'owner') throw new ORPCError('OWNER_PROTECTED', { status: 409 })

    if (input.role !== target.role) {
      if (!isRoleDemotion(target.role, input.role)) {
        const authorityTarget = await this.findAuthorityMember(
          input.organizationId,
          input.userId,
          headers,
        )
        if (authorityTarget === undefined) throw new ORPCError('CONFLICT', { status: 409 })
        if (authorityTarget.role === 'owner') {
          throw new ORPCError('OWNER_PROTECTED', { status: 409 })
        }
      }
      const operation = await this.createMembershipOperation({
        id: generateId('governance-operation'),
        organizationId: input.organizationId,
        operationType: 'change-member-role',
        targetUserId: input.userId,
        targetRole: input.role,
        now: new Date(),
      })
      const updated = await this.reconcileMembershipOperation(operation, headers, user.id)
      if (updated === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      return toNonOwnerMembership(updated)
    }

    return toNonOwnerMembership(target)
  }

  async remove(
    input: InferOutput<typeof SMembershipRemoveInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipRemoveOutput>> {
    const reconciledOperation = await this.reconcileMembershipState(
      input.organizationId,
      headers,
      user.id,
    )
    if (
      reconciledOperation?.operationType === 'remove-member' &&
      reconciledOperation.targetUserId === input.userId
    ) {
      return
    }
    await this.assertOrganizationCommandAvailable(input.organizationId)
    const actor = await this.assertMember(input.organizationId, user.id, 'FORBIDDEN')
    if (actor.role === 'member') throw new ORPCError('FORBIDDEN')
    const target = await this.repository.findById({
      organizationId: input.organizationId,
      userId: input.userId,
    })
    if (target === undefined) throw new ORPCError('NOT_FOUND')
    if (target.role === 'owner') throw new ORPCError('OWNER_PROTECTED', { status: 409 })

    const operation = await this.createMembershipOperation({
      id: generateId('governance-operation'),
      organizationId: input.organizationId,
      operationType: 'remove-member',
      targetUserId: input.userId,
      targetRole: null,
      now: new Date(),
    })
    await this.reconcileMembershipOperation(operation, headers, user.id)
  }

  async leave(
    input: InferOutput<typeof SMembershipLeaveInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipLeaveOutput>> {
    const reconciledOperation = await this.reconcileMembershipState(
      input.organizationId,
      headers,
      user.id,
    )
    if (
      reconciledOperation?.operationType === 'leave-organization' &&
      reconciledOperation.targetUserId === user.id
    ) {
      return
    }
    await this.assertOrganizationCommandAvailable(input.organizationId)
    const membership = await this.assertMember(input.organizationId, user.id, 'NOT_FOUND')
    if (membership.role === 'owner') throw new ORPCError('OWNER_PROTECTED', { status: 409 })

    const operation = await this.createMembershipOperation({
      id: generateId('governance-operation'),
      organizationId: input.organizationId,
      operationType: 'leave-organization',
      targetUserId: user.id,
      targetRole: null,
      now: new Date(),
    })
    await this.reconcileMembershipOperation(operation, headers, user.id)
  }

  async transferOwnership(
    input: InferOutput<typeof SMembershipTransferOwnershipInput>,
    user: Pick<AuthUser, 'id'>,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipTransferOwnershipOutput>> {
    const pending = await this.repository.findPendingTransfer(input.organizationId)
    if (pending !== undefined) {
      if (pending.previousOwnerUserId !== user.id || pending.targetUserId !== input.userId) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      await this.assertPendingTransferOwner(input.organizationId, user.id)
      return this.reconcileTransfer(pending, headers)
    }

    await this.reconcile(input.organizationId, headers, user.id)
    await this.assertOrganizationCommandAvailable(input.organizationId)
    const actor = await this.assertMember(input.organizationId, user.id, 'FORBIDDEN')
    if (actor.role !== 'owner') throw new ORPCError('FORBIDDEN')

    const completed = await this.repository.findCompletedTransfer({
      organizationId: input.organizationId,
      previousOwnerUserId: user.id,
      targetUserId: input.userId,
    })
    if (completed !== undefined) return toOwnerMembership(completed)

    const target = await this.repository.findById({
      organizationId: input.organizationId,
      userId: input.userId,
    })
    if (target === undefined) throw new ORPCError('NOT_FOUND')
    if (target.role === 'owner') throw new ORPCError('CONFLICT', { status: 409 })

    const admission = await this.repository.createTransfer({
      id: generateId('governance-operation'),
      organizationId: input.organizationId,
      previousOwnerUserId: user.id,
      targetUserId: input.userId,
      now: new Date(),
    })
    if (admission.kind === 'invalid') throw new ORPCError('CONFLICT', { status: 409 })
    if (admission.kind === 'already-pending') {
      if (
        admission.transfer.previousOwnerUserId !== user.id ||
        admission.transfer.targetUserId !== input.userId
      ) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
    }
    return this.reconcileTransfer(admission.transfer, headers)
  }

  private async assertPendingTransferOwner(organizationId: string, userId: string): Promise<void> {
    if (!(await this.repository.isOwnerInvariantValid(organizationId))) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    const membership = await this.repository.findById({ organizationId, userId })
    if (membership?.role !== 'owner') throw new ORPCError('FORBIDDEN')
  }

  private async createMembershipOperation(
    input: MembershipRepository.CreateMembershipOperationInput,
  ): Promise<MembershipRepository.MembershipOperation> {
    try {
      return await this.repository.createMembershipOperation(input)
    } catch {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async reconcilePendingMembershipOperation(
    organizationId: string,
    headers: Headers,
    currentUserId?: string,
  ): Promise<MembershipRepository.MembershipOperation | undefined> {
    let operation: MembershipRepository.MembershipOperation | undefined
    try {
      operation = await this.repository.findPendingMembershipOperation(organizationId)
    } catch {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    if (operation === undefined) return undefined
    await this.reconcileMembershipOperation(operation, headers, currentUserId)
    return operation
  }

  private async assertPendingMembershipOperationRecoverable(
    operation: MembershipRepository.MembershipOperation,
    headers: Headers,
    currentUserId?: string,
  ): Promise<void> {
    if (currentUserId === undefined) throw new ORPCError('NOT_FOUND')
    if (
      operation.operationType === 'leave-organization' &&
      currentUserId === operation.targetUserId
    ) {
      return
    }
    const membership = await this.repository.findById({
      organizationId: operation.organizationId,
      userId: currentUserId,
    })
    if (membership === undefined) throw new ORPCError('NOT_FOUND')
    if (membership.role === 'member') throw new ORPCError('CONFLICT', { status: 409 })
    const authorityMember = await this.findAuthorityMember(
      operation.organizationId,
      currentUserId,
      headers,
    )
    if (authorityMember === undefined) throw new ORPCError('NOT_FOUND')
    if (authorityMember.role === 'member') throw new ORPCError('FORBIDDEN')
  }

  private async reconcileMembershipOperation(
    operation: MembershipRepository.MembershipOperation,
    headers: Headers,
    currentUserId?: string,
  ): Promise<MembershipRecord | undefined> {
    await this.assertPendingMembershipOperationRecoverable(operation, headers, currentUserId)
    try {
      await this.repository.incrementMembershipAttempt(operation.id)
      const authorityOrganizationId = await this.requireAuthorityOrganizationId(
        operation.organizationId,
      )
      const target = await this.repository.findById({
        organizationId: operation.organizationId,
        userId: operation.targetUserId,
      })

      if (operation.operationType === 'change-member-role') {
        if (operation.targetRole === null || target === undefined || target.role === 'owner') {
          throw new Error('Membership role operation state is invalid')
        }
        const targetRole = operation.targetRole
        const updateCimiRole = async (): Promise<MembershipRecord> => {
          if (target.role === targetRole) return target
          const updated = await this.repository.updateRole({
            organizationId: operation.organizationId,
            userId: operation.targetUserId,
            role: targetRole,
            updatedAt: new Date(),
          })
          if (updated === undefined) throw new Error('Membership role update returned no row')
          return updated
        }

        let updated: MembershipRecord
        if (isRoleDemotion(target.role, targetRole)) {
          updated = await updateCimiRole()
          const authorityMember = await this.findAuthorityMemberInAuthority(
            authorityOrganizationId,
            operation.targetUserId,
            headers,
          )
          if (authorityMember === undefined || authorityMember.role === 'owner') {
            throw new Error('Membership role operation state is invalid')
          }
          if (authorityMember.role !== targetRole) {
            await this.updateAuthorityRole(
              authorityOrganizationId,
              authorityMember,
              targetRole,
              headers,
            )
          }
        } else {
          const authorityMember = await this.findAuthorityMemberInAuthority(
            authorityOrganizationId,
            operation.targetUserId,
            headers,
          )
          if (authorityMember === undefined || authorityMember.role === 'owner') {
            throw new Error('Membership role operation state is invalid')
          }
          let authorityChanged = false
          try {
            if (authorityMember.role !== targetRole) {
              await this.updateAuthorityRole(
                authorityOrganizationId,
                authorityMember,
                targetRole,
                headers,
              )
              authorityChanged = true
            }
            updated = await updateCimiRole()
          } catch (error) {
            if (authorityChanged) {
              await this.compensateAuthorityRole(
                authorityOrganizationId,
                authorityMember,
                targetRole,
                target.role,
                headers,
              )
            }
            throw error
          }
        }
        await this.repository.completeMembershipOperation(operation.id)
        return updated
      }

      if (target?.role === 'owner') {
        throw new Error('Membership removal operation targeted an owner')
      }
      if (target !== undefined) {
        const deleted = await this.repository.delete({
          organizationId: operation.organizationId,
          userId: operation.targetUserId,
        })
        if (!deleted) {
          const remaining = await this.repository.findById({
            organizationId: operation.organizationId,
            userId: operation.targetUserId,
          })
          if (remaining !== undefined) throw new Error('Membership removal did not complete')
        }
      }

      const authorityMember = await this.findAuthorityMemberInAuthority(
        authorityOrganizationId,
        operation.targetUserId,
        headers,
      )
      if (authorityMember?.role === 'owner') {
        throw new Error('Membership removal operation targeted an owner')
      }
      if (authorityMember !== undefined) {
        if (
          operation.operationType === 'leave-organization' &&
          currentUserId === operation.targetUserId
        ) {
          await this.authority.leaveOrganization({
            organizationId: authorityOrganizationId,
            headers,
          })
        } else {
          await this.authority.removeMember({
            organizationId: authorityOrganizationId,
            userId: operation.targetUserId,
            headers,
          })
        }
      }
      await this.repository.completeMembershipOperation(operation.id)
      return undefined
    } catch (error) {
      await this.recordMembershipFailure(operation.id, error)
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async recordMembershipFailure(id: string, error: unknown): Promise<void> {
    try {
      await this.repository.failMembershipOperation({
        id,
        failureCode: error instanceof ORPCError ? error.code : 'CONFLICT',
        failureMessage:
          error instanceof Error ? error.message : 'Membership reconciliation did not complete',
      })
    } catch {
      // Preserve the pending operation when failure metadata cannot be recorded.
    }
  }

  private async reconcileAuthorityMembers(organizationId: string, headers: Headers): Promise<void> {
    try {
      if (await this.repository.hasPendingGovernanceOperation(organizationId)) return
      const authorityOrganizationId =
        await this.repository.findAuthorityOrganizationId(organizationId)
      if (authorityOrganizationId === undefined) return
      const authorityMembers = await this.authority.listAllMembers({
        organizationId: authorityOrganizationId,
        headers,
      })
      if (authorityMembers.some((member) => member.organizationId !== authorityOrganizationId)) {
        throw new Error('Membership authority returned members from another organization')
      }
      const members: MembershipRecord[] = authorityMembers.map((member) => ({
        organizationId,
        userId: member.userId,
        role: member.role,
        createdAt: member.createdAt,
        updatedAt: member.createdAt,
      }))
      await this.assertAuthorityOwner(organizationId, members)
      await this.repository.replaceMembers(organizationId, members)
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
  }

  private async reconcileCurrentUserAccess(
    organizationId: string,
    headers: Headers,
    currentUserId?: string,
  ): Promise<boolean> {
    if (currentUserId === undefined) return true
    const persisted = await this.repository.findById({ organizationId, userId: currentUserId })
    const authorityOrganizationId =
      await this.repository.findAuthorityOrganizationId(organizationId)
    if (authorityOrganizationId === undefined) {
      if (persisted === undefined) return false
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
    let authorityMember: MembershipAuthorityMember | undefined
    try {
      authorityMember = await this.findAuthorityMemberInAuthority(
        authorityOrganizationId,
        currentUserId,
        headers,
      )
    } catch (error) {
      if (persisted === undefined) return false
      throw error
    }
    if (authorityMember !== undefined) return true
    if (persisted === undefined) return false
    if (persisted.role === 'owner') throw new ORPCError('INTERNAL_SERVER_ERROR')
    if (!(await this.repository.delete({ organizationId, userId: currentUserId }))) {
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
    return false
  }

  private async findAuthorityMember(
    organizationId: string,
    userId: string,
    headers: Headers,
  ): Promise<MembershipAuthorityMember | undefined> {
    try {
      const authorityOrganizationId = await this.requireAuthorityOrganizationId(organizationId)
      return await this.findAuthorityMemberInAuthority(authorityOrganizationId, userId, headers)
    } catch (error) {
      if (error instanceof ORPCError && error.code === 'CONFLICT') throw error
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async findAuthorityMemberInAuthority(
    authorityOrganizationId: string,
    userId: string,
    headers: Headers,
  ): Promise<MembershipAuthorityMember | undefined> {
    try {
      const member = await this.authority.getMember({
        organizationId: authorityOrganizationId,
        userId,
        headers,
      })
      if (member !== undefined && member.organizationId !== authorityOrganizationId) {
        throw new Error('Membership authority returned a member from another organization')
      }
      return member
    } catch {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async requireAuthorityOrganizationId(organizationId: string): Promise<string> {
    const authorityOrganizationId =
      await this.repository.findAuthorityOrganizationId(organizationId)
    if (authorityOrganizationId === undefined) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    return authorityOrganizationId
  }

  private async updateAuthorityRole(
    authorityOrganizationId: string,
    member: MembershipAuthorityMember,
    role: 'admin' | 'member',
    headers: Headers,
  ): Promise<void> {
    try {
      const updated = await this.authority.changeMemberRole({
        organizationId: authorityOrganizationId,
        memberId: member.id,
        role,
        headers,
      })
      if (
        updated.organizationId !== authorityOrganizationId ||
        updated.userId !== member.userId ||
        updated.role !== role
      ) {
        throw new Error('Membership authority returned an invalid role update')
      }
    } catch {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async compensateAuthorityRole(
    authorityOrganizationId: string,
    member: MembershipAuthorityMember,
    expectedRole: 'admin' | 'member',
    role: 'admin' | 'member',
    headers: Headers,
  ): Promise<void> {
    const current = await this.findAuthorityMemberInAuthority(
      authorityOrganizationId,
      member.userId,
      headers,
    )
    if (
      current === undefined ||
      current.id !== member.id ||
      current.organizationId !== authorityOrganizationId ||
      current.role !== expectedRole
    ) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    await this.updateAuthorityRole(authorityOrganizationId, current, role, headers)
  }

  private async reconcileTransfer(
    transfer: MembershipRepository.Transfer,
    headers: Headers,
  ): Promise<InferOutput<typeof SMembershipTransferOwnershipOutput>> {
    try {
      await this.repository.markTransferAttempt({ id: transfer.id, now: new Date() })
      const authorityOrganizationId = await this.requireAuthorityOrganizationId(
        transfer.organizationId,
      )
      const result = await this.authority.reconcileOwnership({
        organizationId: authorityOrganizationId,
        previousOwnerUserId: transfer.previousOwnerUserId,
        targetUserId: transfer.targetUserId,
        headers,
      })
      assertAuthorityMember(
        result.previousOwner,
        authorityOrganizationId,
        transfer.previousOwnerUserId,
        'admin',
      )
      assertAuthorityMember(result.target, authorityOrganizationId, transfer.targetUserId, 'owner')
      let completed: MembershipRecord
      try {
        completed = await this.repository.completeTransfer({
          id: transfer.id,
          organizationId: transfer.organizationId,
          previousOwnerUserId: transfer.previousOwnerUserId,
          targetUserId: transfer.targetUserId,
          now: new Date(),
        })
      } catch (error) {
        const replay = await this.repository.findCompletedTransfer({
          organizationId: transfer.organizationId,
          previousOwnerUserId: transfer.previousOwnerUserId,
          targetUserId: transfer.targetUserId,
        })
        if (replay !== undefined) return toOwnerMembership(replay)
        throw error
      }
      return toOwnerMembership(completed)
    } catch (error) {
      await this.recordTransferFailure(transfer.id, error)
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async recordTransferFailure(id: string, error: unknown): Promise<void> {
    try {
      await this.repository.failTransfer({
        id,
        now: new Date(),
        failureCode: error instanceof ORPCError ? error.code : 'CONFLICT',
        failureMessage: error instanceof Error ? error.message : 'Ownership transfer failed',
      })
    } catch {
      // Preserve the pending operation when failure metadata cannot be recorded.
    }
  }

  private async assertAuthorityOwner(
    organizationId: string,
    members: MembershipRecord[],
  ): Promise<void> {
    const owners = members.filter((member) => member.role === 'owner')
    const localOwner = await this.repository.findOwner(organizationId)
    if (
      owners.length !== 1 ||
      localOwner === undefined ||
      owners[0]?.userId !== localOwner.userId ||
      members.some((member) => member.organizationId !== organizationId) ||
      new Set(members.map((member) => member.userId)).size !== members.length
    ) {
      throw new ORPCError('INTERNAL_SERVER_ERROR')
    }
  }

  private async assertMember(
    organizationId: string,
    userId: string,
    missingCode: 'NOT_FOUND' | 'FORBIDDEN',
  ): Promise<MembershipRecord> {
    if (await this.repository.hasPendingGovernanceOperation(organizationId)) {
      throw new ORPCError(missingCode === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', {
        status: missingCode === 'NOT_FOUND' ? 404 : 409,
      })
    }
    const membership = await this.repository.findById({ organizationId, userId })
    if (membership === undefined) throw new ORPCError(missingCode)
    if (!(await this.repository.isOwnerInvariantValid(organizationId))) {
      throw new ORPCError(missingCode === 'NOT_FOUND' ? 'NOT_FOUND' : 'CONFLICT', {
        status: missingCode === 'NOT_FOUND' ? 404 : 409,
      })
    }
    return membership
  }

  private async assertOrganizationCommandAvailable(organizationId: string): Promise<void> {
    if (await this.repository.hasPendingGovernanceOperation(organizationId)) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    if (!(await this.repository.isOwnerInvariantValid(organizationId))) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }
}

function isRoleDemotion(current: 'admin' | 'member', next: 'admin' | 'member'): boolean {
  return current === 'admin' && next === 'member'
}

function toPublicMembership(membership: MembershipRecord) {
  return {
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }
}

function toNonOwnerMembership(
  membership: MembershipRecord,
): InferOutput<typeof SMembershipChangeRoleOutput> {
  if (membership.role === 'owner') {
    throw new Error('Non-owner membership output received an owner role')
  }
  return {
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }
}

function toOwnerMembership(
  membership: MembershipRecord,
): InferOutput<typeof SMembershipTransferOwnershipOutput> {
  return {
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: 'owner',
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }
}

function assertAuthorityMember(
  member: AuthorityMember,
  organizationId: string,
  userId: string,
  role: AuthorityMember['role'],
): void {
  if (
    member.organizationId !== organizationId ||
    member.userId !== userId ||
    member.role !== role
  ) {
    throw new Error('Better Auth membership state did not converge')
  }
}
