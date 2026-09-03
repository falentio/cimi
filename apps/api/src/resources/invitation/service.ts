import type { AuthUser, OrganizationAuthority } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertOrganizationRole, type SiteScopeGuardDependencies } from '@cimi/guard'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import type { InvitationRepository } from './repository.ts'
import { hashInvitationToken, mintInvitationToken } from './token.ts'

export interface InvitationServiceDependencies {
  repository: InvitationRepository
  scope: Pick<SiteScopeGuardDependencies, 'membership'>
  authority: OrganizationAuthority
  membership?: OrganizationMembershipReconciler | undefined
}

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

export class InvitationService {
  private readonly repository: InvitationRepository
  private readonly scope: Pick<SiteScopeGuardDependencies, 'membership'>
  private readonly authority: OrganizationAuthority
  private readonly membership: OrganizationMembershipReconciler | undefined

  constructor({ repository, scope, authority, membership }: InvitationServiceDependencies) {
    this.repository = repository
    this.scope = scope
    this.authority = authority
    this.membership = membership
  }

  async list(
    input: InferOutput<typeof schema.SInvitationListInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SInvitationListOutput>> {
    await this.reconcileOrganization(input.organizationId, user.id, headers)
    await assertOrganizationRole(user, input.organizationId, this.scope, {
      requiredRole: 'admin',
      missingCode: 'NOT_FOUND',
    })
    return this.repository.findMany(input.organizationId, {
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
  }

  async create(
    input: InferOutput<typeof schema.SInvitationCreateInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SInvitationCreateOutput>> {
    await this.reconcileOrganization(input.organizationId, user.id, headers)
    await assertOrganizationRole(user, input.organizationId, this.scope, {
      requiredRole: 'admin',
      missingCode: 'NOT_FOUND',
    })
    const now = new Date()
    const { token, tokenHash } = mintInvitationToken()
    try {
      const record = await this.repository.insert({
        id: generateId('inv'),
        organizationId: input.organizationId,
        role: input.role,
        tokenHash,
        expiresAt: new Date(now.getTime() + INVITATION_EXPIRY_MS),
        createdAt: now,
        updatedAt: now,
      })
      return { invitation: toPublicInvitation(record), token }
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
  }

  async revoke(
    input: InferOutput<typeof schema.SInvitationRevokeInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SInvitationRevokeOutput>> {
    const existing = await this.repository.findById(input.invitationId)
    if (existing === undefined) throw new ORPCError('NOT_FOUND')
    await this.reconcileOrganization(existing.organizationId, user.id, headers)
    await assertOrganizationRole(user, existing.organizationId, this.scope, {
      requiredRole: 'admin',
      missingCode: 'NOT_FOUND',
    })
    const result = await this.repository.revoke({
      invitationId: input.invitationId,
      now: new Date(),
    })
    if (result.status === 'consumed') throw new ORPCError('INVITATION_CONSUMED')
    if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
  }

  async accept(
    input: InferOutput<typeof schema.SInvitationAcceptInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SInvitationAcceptOutput>> {
    const now = new Date()
    const tokenHash = hashInvitationToken(input.token)
    const precheck = await this.repository.findByTokenHash(tokenHash)
    if (precheck === undefined || precheck.status !== 'pending' || precheck.expiresAt <= now) {
      throw new ORPCError('NOT_FOUND')
    }
    const organizationId = precheck.organizationId
    await this.reconcileOrganization(organizationId, user.id, headers)
    if (await this.scope.membership.hasPendingGovernanceOperation(organizationId)) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    const localRole = await this.scope.membership.getRole(organizationId, user.id)
    if (localRole !== undefined && localRole !== precheck.role) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    const authorityOrganizationId =
      await this.repository.findAuthorityOrganizationId(organizationId)
    if (authorityOrganizationId === undefined) throw new ORPCError('NOT_FOUND')
    if (headers === undefined) throw new ORPCError('INTERNAL_SERVER_ERROR')
    const previousAuthority = await this.getAuthorityMember(
      authorityOrganizationId,
      user.id,
      headers,
    )
    if (previousAuthority?.role === 'owner') throw new ORPCError('CONFLICT', { status: 409 })
    const previousRole = previousAuthority === undefined ? undefined : previousAuthority.role
    const needsAdmit = previousAuthority === undefined || previousAuthority.role !== precheck.role
    if (needsAdmit) {
      try {
        await this.authority.admitMember({
          organizationId: authorityOrganizationId,
          userId: user.id,
          role: precheck.role,
          headers,
        })
      } catch (error) {
        if (error instanceof ORPCError) throw error
        throw new ORPCError('CONFLICT', { status: 409 })
      }
    }
    let result: InvitationRepository.ConsumeResult
    try {
      result = await this.repository.consume({ tokenHash, userId: user.id, now })
    } catch (error) {
      if (needsAdmit)
        await this.compensateAuthority(authorityOrganizationId, user.id, previousRole, headers)
      throw error
    }
    if (result.status === 'consumed') return toNonOwnerMembership(result.membership)
    if (needsAdmit)
      await this.compensateAuthority(authorityOrganizationId, user.id, previousRole, headers)
    if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
    throw new ORPCError('NOT_FOUND')
  }

  private async getAuthorityMember(organizationId: string, userId: string, headers: Headers) {
    try {
      return await this.authority.getMember({ organizationId, userId, headers })
    } catch {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
  }

  private async compensateAuthority(
    organizationId: string,
    userId: string,
    previousRole: 'admin' | 'member' | undefined,
    headers: Headers,
  ): Promise<void> {
    try {
      if (previousRole === undefined) {
        await this.authority.removeMember({ organizationId, userId, headers })
        return
      }
      const current = await this.authority.getMember({ organizationId, userId, headers })
      if (current === undefined || current.role === previousRole) return
      await this.authority.changeMemberRole({
        organizationId,
        memberId: current.id,
        role: previousRole,
        headers,
      })
    } catch {
      // Best-effort compensation must not mask the original acceptance outcome.
    }
  }

  private async reconcileOrganization(
    organizationId: string,
    userId: string,
    headers?: Headers,
  ): Promise<void> {
    if (this.membership === undefined) return
    await this.membership.reconcile(organizationId, headers, userId)
  }
}

function toPublicInvitation(
  record: InvitationRepository.InvitationRecord,
): InferOutput<typeof schema.SInvitation> {
  return {
    id: record.id,
    organizationId: record.organizationId,
    role: record.role,
    expiresAt: record.expiresAt.toISOString(),
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toNonOwnerMembership(
  membership: InvitationRepository.MembershipRecord,
): InferOutput<typeof schema.SMembershipNonOwner> {
  return {
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  }
}

function isConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /constraint|unique/i.test(error.message)
}
