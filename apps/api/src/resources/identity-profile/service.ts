import type { AuthUser } from '@cimi/auth'
import {
  SDeletionStatusInput,
  SIdentifyInput,
  SIdentifyOutput,
  SProfileGetInput,
  SProfileGetOutput,
  SProfileListInput,
  SProfileListOutput,
  SRequestProfileDeletionInput,
  SRequestProfileDeletionOutput,
  hasAllowedProfileTraitKeys,
} from '@cimi/contract'
import {
  assertSiteManagementScope,
  assertSiteScope,
  type SiteScopeGuardDependencies,
} from '@cimi/guard'
import type { LifecycleLock } from '@cimi/kernel'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { CollectionPolicyService } from '../collection-policy/service.ts'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import type { SiteRepository } from '../site/repository.ts'
import type { IdentityProfileRepository } from './repository.ts'

export type IdentifyInput = InferOutput<typeof SIdentifyInput>
export type IdentifyOutput = InferOutput<typeof SIdentifyOutput>
export type ProfileListInput = InferOutput<typeof SProfileListInput>
export type ProfileListOutput = InferOutput<typeof SProfileListOutput>
export type ProfileGetInput = InferOutput<typeof SProfileGetInput>
export type ProfileGetOutput = InferOutput<typeof SProfileGetOutput>
export type DeletionStatusInput = InferOutput<typeof SDeletionStatusInput>
export type RequestProfileDeletionInput = InferOutput<typeof SRequestProfileDeletionInput>
export type RequestProfileDeletionOutput = InferOutput<typeof SRequestProfileDeletionOutput>

export interface IdentityProfileProtection {
  consume(input: {
    readonly siteId: string
    readonly sourceIp?: string | undefined
    readonly units: number
    readonly now: Date
  }): Promise<void>
}

export interface IdentityProfileRequestContext {
  readonly sourceIp?: string | undefined
  readonly country?: string | undefined
  readonly isBot?: boolean | undefined
}

export interface IdentityProfileServiceDependencies {
  readonly repository: IdentityProfileRepository
  readonly siteRepository: SiteRepository
  readonly collectionPolicy: CollectionPolicyService
  readonly scope: SiteScopeGuardDependencies
  readonly membership?: OrganizationMembershipReconciler | undefined
  readonly protection?: IdentityProfileProtection | undefined
  readonly lifecycleLock?: LifecycleLock | undefined
  readonly clock?: (() => Date) | undefined
}

const DEFAULT_PAGE_SIZE = 20

export class IdentityProfileService {
  private readonly repository: IdentityProfileRepository
  private readonly siteRepository: SiteRepository
  private readonly collectionPolicy: CollectionPolicyService
  private readonly scope: SiteScopeGuardDependencies
  private readonly membership: OrganizationMembershipReconciler | undefined
  private readonly protection: IdentityProfileProtection | undefined
  private readonly lifecycleLock: LifecycleLock | undefined
  private readonly clock: () => Date

  constructor({
    repository,
    siteRepository,
    collectionPolicy,
    scope,
    membership,
    protection,
    lifecycleLock,
    clock,
  }: IdentityProfileServiceDependencies) {
    this.repository = repository
    this.siteRepository = siteRepository
    this.collectionPolicy = collectionPolicy
    this.scope = scope
    this.membership = membership
    this.protection = protection
    this.lifecycleLock = lifecycleLock
    this.clock = clock ?? (() => new Date())
  }

  async identify(
    input: IdentifyInput,
    request: IdentityProfileRequestContext = {},
  ): Promise<IdentifyOutput> {
    return this.withAdmissionLease(input.ingestionIdentifier, () =>
      this.identifyAdmitted(input, request),
    )
  }

  private async identifyAdmitted(
    input: IdentifyInput,
    request: IdentityProfileRequestContext,
  ): Promise<IdentifyOutput> {
    const site = await this.resolveSite(input.ingestionIdentifier)
    const now = this.clock()
    if (!hasAllowedProfileTraitKeys(input.traits)) {
      throw new ORPCError('BAD_REQUEST', { status: 400 })
    }
    if (this.protection !== undefined) {
      await this.protection.consume({ siteId: site.id, sourceIp: request.sourceIp, units: 1, now })
    }
    const decision = await this.collectionPolicy.admit({
      siteId: site.id,
      hostname: site.hostname,
      country: request.country,
      ip: request.sourceIp,
      isBot: request.isBot,
      identifiedUserId: input.identifiedUserId,
      traits: input.traits,
      operation: 'identify',
      collectionContext: input.collectionContext,
    })
    if (decision.outcome.kind === 'rejected' || decision.outcome.bot === 'recorded_excluded')
      throw new ORPCError('FORBIDDEN', { status: 403 })
    const result = await this.repository.identify({
      siteId: site.id,
      identifiedUserId: input.identifiedUserId,
      traits: input.traits,
      anonymousIdentityId: input.anonymousIdentityId,
      now,
    })
    if (result.kind === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
    if (result.kind === 'invalid') throw new ORPCError('BAD_REQUEST', { status: 400 })
    if (result.kind === 'payload-too-large')
      throw new ORPCError('PAYLOAD_TOO_LARGE', { status: 413 })
    return result.output
  }

  async list(
    input: ProfileListInput,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<ProfileListOutput> {
    await this.reconcileSiteOrganization(input.siteId, user.id, headers)
    await assertSiteScope(user, input.siteId, this.scope)
    return this.repository.list({
      siteId: input.siteId,
      offset: input.offset ?? 0,
      limit: input.limit ?? DEFAULT_PAGE_SIZE,
    })
  }

  async get(
    input: ProfileGetInput,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<ProfileGetOutput> {
    await this.reconcileSiteOrganization(input.siteId, user.id, headers)
    await assertSiteScope(user, input.siteId, this.scope)
    const profile = await this.repository.find(input)
    if (profile === undefined) throw new ORPCError('NOT_FOUND')
    return profile
  }

  async getDeletionStatus(
    input: DeletionStatusInput,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ) {
    await this.reconcileSiteOrganization(input.siteId, user.id, headers)
    await assertSiteScope(user, input.siteId, this.scope)
    const status = await this.repository.getDeletionStatus(input)
    if (status === undefined) throw new ORPCError('NOT_FOUND')
    return status
  }

  async requestDeletion(
    input: RequestProfileDeletionInput,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<RequestProfileDeletionOutput> {
    await this.reconcileSiteOrganization(input.siteId, user.id, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope)
    const result = await this.withDeletionLease(() =>
      this.repository.requestDeletion({ ...input, now: this.clock() }),
    )
    if (result.kind === 'not-found') throw new ORPCError('NOT_FOUND')
    if (result.kind === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
    return result.output
  }

  private async resolveSite(ingestionIdentifier: string): Promise<SiteRepository.SiteRecord> {
    const site = await this.siteRepository.findByIngestionIdentifier(ingestionIdentifier)
    if (site === undefined || site.status !== 'active') throw new ORPCError('NOT_FOUND')
    return site
  }

  private async reconcileSiteOrganization(
    siteId: string,
    userId: string,
    headers?: Headers,
  ): Promise<void> {
    if (this.membership === undefined) return
    const organizationId = await this.scope.siteScope.getOrganizationId(siteId)
    if (organizationId !== undefined)
      await this.membership.reconcile(organizationId, headers, userId)
  }

  private async withAdmissionLease<T>(
    ingestionIdentifier: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.lifecycleLock === undefined) return operation()
    const lease = await this.lifecycleLock.acquire('ingestion')
    if (lease === undefined) {
      const site = await this.siteRepository.findByIngestionIdentifier(ingestionIdentifier)
      if (site === undefined) throw new ORPCError('NOT_FOUND')
      throw new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
    }
    try {
      return await operation()
    } finally {
      await lease.release()
    }
  }

  private async withDeletionLease<T>(operation: () => Promise<T>): Promise<T> {
    if (this.lifecycleLock === undefined) return operation()
    const lease = await this.lifecycleLock.acquire('ingestion')
    if (lease === undefined) throw new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
    try {
      return await operation()
    } finally {
      await lease.release()
    }
  }
}
