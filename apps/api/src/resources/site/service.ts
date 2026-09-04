import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import {
  assertOrganizationRole,
  assertSiteManagementScope,
  assertSiteScope,
  type SiteScopeGuardDependencies,
} from '@cimi/guard'
import type {
  LifecycleLock,
  LifecycleOperationStatusReader,
  PersistedLifecycleOperationKind,
} from '@cimi/kernel'
import { canonicalizeHostname, generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { SiteRepository } from './repository.ts'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'

export interface SiteServiceDependencies {
  repository: SiteRepository
  scope: SiteScopeGuardDependencies
  lock: LifecycleLock
  lifecycle: LifecycleOperationStatusReader
  membership?: OrganizationMembershipReconciler | undefined
}

export class SiteService {
  private readonly repository: SiteRepository
  private readonly scope: SiteScopeGuardDependencies
  private readonly lock: LifecycleLock
  private readonly lifecycle: LifecycleOperationStatusReader
  private readonly membership: OrganizationMembershipReconciler | undefined

  constructor({ repository, scope, lock, lifecycle, membership }: SiteServiceDependencies) {
    this.repository = repository
    this.scope = scope
    this.lock = lock
    this.lifecycle = lifecycle
    this.membership = membership
  }

  async list(
    input: InferOutput<typeof schema.SSiteListInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteListOutput>> {
    await this.reconcileOrganization(input.organizationId, user.id, headers)
    const role = await this.scope.membership.getRole(input.organizationId, user.id)
    if (role === undefined) return emptySitePage()
    if (await this.scope.membership.hasPendingGovernanceOperation(input.organizationId)) {
      return emptySitePage()
    }
    return this.repository.findMany(input.organizationId, {
      offset: input.offset ?? 0,
      limit: input.limit ?? 20,
    })
  }

  async get(
    input: InferOutput<typeof schema.SSiteGetInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteGetOutput>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteScope(user, input.siteId, this.scope)
    const site = await this.repository.findById(input.siteId)
    if (site === undefined || site.status !== 'active') throw new ORPCError('NOT_FOUND')
    return toPublicSite(site)
  }

  async getDeletionStatus(
    input: InferOutput<typeof schema.SSiteDeletionStatusInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteDeletionStatusOutput>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope)
    const status = await this.repository.getDeletionStatus(input.siteId)
    if (status === undefined) throw new ORPCError('NOT_FOUND')
    return status
  }

  async create(
    input: InferOutput<typeof schema.SSiteCreateInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteCreateOutput>> {
    await this.reconcileOrganization(input.organizationId, user.id, headers)
    await assertOrganizationRole(user, input.organizationId, this.scope, {
      requiredRole: 'admin',
      missingCode: 'NOT_FOUND',
    })
    try {
      return await this.repository.insert({
        id: generateId('ste'),
        organizationId: input.organizationId,
        name: input.name,
        hostname: canonicalizeHostname(input.hostname),
        ingestionIdentifier: generateId('ing'),
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
  }

  async update(
    input: InferOutput<typeof schema.SSiteUpdateV2Input>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteUpdateV2Output>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope, { requiredRole: 'admin' })
    try {
      const site = await this.repository.updateActive({
        siteId: input.siteId,
        name: input.name,
        hostname: canonicalizeHostname(input.hostname),
        reportingTimezone: input.reportingTimezone,
        weekStartsOn: input.weekStartsOn,
      })
      if (site !== undefined) return site
    } catch (error) {
      if (isConstraintError(error)) throw new ORPCError('CONFLICT', { status: 409 })
      throw error
    }
    const current = await this.repository.findById(input.siteId)
    if (current === undefined) {
      if ((await this.repository.getDeletionStatus(input.siteId)) === undefined) {
        throw new ORPCError('NOT_FOUND')
      }
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    throw new ORPCError('CONFLICT', { status: 409 })
  }

  async delete(
    input: InferOutput<typeof schema.SSiteDeleteInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteDeleteOutput>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope, { requiredRole: 'owner' })
    return this.withLifecycleLease('site_deletion', async () => {
      const result = await this.repository.beginDelete({
        siteId: input.siteId,
        operationId: generateId('sop'),
        requestedAt: new Date(),
      })
      if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
      if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
      return { accepted: true, status: 'deleting', operationId: result.operationId }
    })
  }

  async recover(
    input: InferOutput<typeof schema.SSiteRecoverInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteRecoverOutput>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope)
    return this.withLifecycleLease('site_recovery', async () => {
      const result = await this.repository.beginRecover({
        siteId: input.siteId,
        operationId: generateId('sop'),
        requestedAt: new Date(),
      })
      if (result.status === 'not-found') throw new ORPCError('NOT_FOUND')
      if (result.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
      return { accepted: true, status: 'recovering', operationId: result.operationId }
    })
  }

  async rotateIngestionIdentifier(
    input: InferOutput<typeof schema.SSiteRotateIngestionInput>,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<InferOutput<typeof schema.SSiteRotateIngestionOutput>> {
    await this.reconcileSiteOrganization(input.siteId, user, headers)
    await assertSiteManagementScope(user, input.siteId, this.scope, { requiredRole: 'admin' })
    const site = await this.repository.rotateIngestionIdentifier(input.siteId, generateId('ing'))
    if (site !== undefined) return site
    const current = await this.repository.findById(input.siteId)
    if (current === undefined) {
      if ((await this.repository.getDeletionStatus(input.siteId)) === undefined) {
        throw new ORPCError('NOT_FOUND')
      }
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    throw new ORPCError('CONFLICT', { status: 409 })
  }

  private async reconcileOrganization(
    organizationId: string,
    userId: string,
    headers?: Headers,
  ): Promise<void> {
    if (this.membership === undefined) return
    await this.membership.reconcile(organizationId, headers, userId)
  }

  private async reconcileSiteOrganization(
    siteId: string,
    user: Pick<AuthUser, 'id'>,
    headers?: Headers,
  ): Promise<void> {
    const organizationId = await this.scope.siteScope.getOrganizationId(siteId)
    if (organizationId !== undefined)
      await this.reconcileOrganization(organizationId, user.id, headers)
  }

  private async withLifecycleLease<T>(
    kind: 'site_deletion' | 'site_recovery',
    operation: () => Promise<T>,
  ): Promise<T> {
    const lease = await this.lock.acquire(kind)
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      const activeOperation = await this.lifecycle.getActiveOperation()
      if (activeOperation !== null && !isSiteLifecycleKind(activeOperation.kind)) {
        throw new ORPCError('CONFLICT', { status: 409 })
      }
      return await operation()
    } finally {
      await lease.release()
    }
  }
}

function isSiteLifecycleKind(kind: PersistedLifecycleOperationKind): boolean {
  return kind === 'site_deletion' || kind === 'site_recovery' || kind === 'site_purge'
}

function emptySitePage(): InferOutput<typeof schema.SSiteListOutput> {
  return { items: [], nextOffset: null, hasMore: false, totalCount: 0 }
}

function toPublicSite(site: SiteRepository.SiteRecord): SiteRepository.Site {
  return {
    id: site.id,
    organizationId: site.organizationId,
    name: site.name,
    hostname: site.hostname,
    ingestionIdentifier: site.ingestionIdentifier,
    reportingTimezone: site.reportingTimezone,
    weekStartsOn: site.weekStartsOn,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }
}

function isConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /constraint|unique|reserved/i.test(error.message)
}
