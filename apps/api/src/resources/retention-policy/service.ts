import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin, assertSiteManagementScope } from '@cimi/guard'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock } from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import type { RetentionPolicyRepository } from './repository.ts'

export type RetentionPolicyGetInput = InferOutput<typeof schema.SRetentionPolicyGetFields>
export type RetentionPolicyUpdateInput = InferOutput<typeof schema.SRetentionPolicyUpdateFields>
export type RetentionPolicyOutput = InferOutput<typeof schema.SRetentionPolicyResult>

export interface RetentionPolicyIdFactory {
  retentionPolicyId(): string
}

export interface RetentionPolicyServiceDependencies {
  repository: RetentionPolicyRepository
  lock: LifecycleLock
  scope: SiteScopeGuardDependencies
  clock?: (() => Date) | undefined
  ids?: RetentionPolicyIdFactory | undefined
}

export class RetentionPolicyService {
  private readonly repository: RetentionPolicyRepository
  private readonly lock: LifecycleLock
  private readonly scope: SiteScopeGuardDependencies
  private readonly clock: () => Date
  private readonly ids: RetentionPolicyIdFactory

  constructor({ repository, lock, scope, clock, ids }: RetentionPolicyServiceDependencies) {
    this.repository = repository
    this.lock = lock
    this.scope = scope
    this.clock = clock ?? (() => new Date())
    this.ids = ids ?? { retentionPolicyId: () => generateId('rtn') }
  }

  async get(
    input: RetentionPolicyGetInput,
    user: AuthUser | undefined,
  ): Promise<RetentionPolicyOutput> {
    if (input.scope === 'installation') {
      assertInstallationAdmin(user)
      const resolved = await this.repository.findResolved({ siteId: null })
      return {
        scope: 'installation',
        installationDefault: resolved.installationDefault,
        siteOverride: null,
        effectivePolicy: resolved.effectivePolicy,
        updatedAt: resolved.updatedAt,
      }
    }
    await assertSiteManagementScope(user, input.siteId, this.scope)
    const resolved = await this.repository.findResolved({ siteId: input.siteId })
    return {
      scope: 'site',
      siteId: input.siteId,
      installationDefault: resolved.installationDefault,
      siteOverride: resolved.siteOverride,
      effectivePolicy: resolved.effectivePolicy,
      updatedAt: resolved.updatedAt,
    }
  }

  async update(
    input: RetentionPolicyUpdateInput,
    user: AuthUser | undefined,
  ): Promise<RetentionPolicyOutput> {
    if (input.scope === 'installation') {
      assertInstallationAdmin(user)
      if (input.policy === null || input.policy === undefined) {
        throw new ORPCError('BAD_REQUEST')
      }
      const lease = await this.lock.acquire('retention')
      if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      try {
        const resolved = await this.repository.saveInstallationDefault({
          id: this.ids.retentionPolicyId(),
          policy: input.policy,
          now: this.clock(),
        })
        return {
          scope: 'installation',
          installationDefault: resolved.installationDefault,
          siteOverride: null,
          effectivePolicy: resolved.effectivePolicy,
          updatedAt: resolved.updatedAt,
        }
      } finally {
        await lease.release()
      }
    }
    await assertSiteManagementScope(user, input.siteId, this.scope)
    if (input.policy === undefined) {
      throw new ORPCError('BAD_REQUEST')
    }
    const lease = await this.lock.acquire('retention')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      const resolved =
        input.policy === null
          ? await this.repository.clearSiteOverride({ siteId: input.siteId, now: this.clock() })
          : await this.repository.saveSiteOverride({
              id: this.ids.retentionPolicyId(),
              siteId: input.siteId,
              policy: input.policy,
              now: this.clock(),
            })
      return {
        scope: 'site',
        siteId: input.siteId,
        installationDefault: resolved.installationDefault,
        siteOverride: resolved.siteOverride,
        effectivePolicy: resolved.effectivePolicy,
        updatedAt: resolved.updatedAt,
      }
    } finally {
      await lease.release()
    }
  }
}
