import type { AuthUser } from '@cimi/auth'
import { schema } from '@cimi/contract'
import { assertInstallationAdmin, assertSiteManagementScope, assertSiteScope } from '@cimi/guard'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock, LifecycleOperationStatusReader } from '@cimi/kernel'
import { generateId } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import type { InferOutput } from 'valibot'
import { evaluateAdmission, type AdmissionDecision, type AdmissionInput } from './evaluator.ts'
import {
  resolvePolicy,
  PolicyValidationError,
  type PolicyValues,
  validatePolicyCombination,
} from './model.ts'
import type { CollectionPolicyRepository } from './repository.ts'

export type CollectionPolicyGetInput = InferOutput<typeof schema.SCollectionPolicySiteFields>
export type CollectionPolicyUpdateInput = InferOutput<typeof schema.SCollectionPolicyUpdateFields>
export type CollectionPolicyOutput = InferOutput<typeof schema.PSafePolicy>
export type CollectionPolicyUpdateOutput = InferOutput<typeof schema.SPolicy>

export interface CollectionPolicyIdFactory {
  collectionPolicyRevisionId(): string
}

export interface CollectionPolicyServiceDependencies {
  readonly repository: CollectionPolicyRepository
  readonly lock: LifecycleLock
  readonly scope: SiteScopeGuardDependencies
  readonly lifecycle: LifecycleOperationStatusReader
  readonly clock?: (() => Date) | undefined
  readonly ids?: CollectionPolicyIdFactory | undefined
}

export class CollectionPolicyService {
  private readonly repository: CollectionPolicyRepository
  private readonly lock: LifecycleLock
  private readonly scope: SiteScopeGuardDependencies
  private readonly lifecycle: LifecycleOperationStatusReader
  private readonly clock: () => Date
  private readonly ids: CollectionPolicyIdFactory

  constructor({
    repository,
    lock,
    scope,
    lifecycle,
    clock,
    ids,
  }: CollectionPolicyServiceDependencies) {
    this.repository = repository
    this.lock = lock
    this.scope = scope
    this.lifecycle = lifecycle
    this.clock = clock ?? (() => new Date())
    this.ids = ids ?? { collectionPolicyRevisionId: () => generateId('cpr') }
  }

  async get(
    input: CollectionPolicyGetInput,
    user: AuthUser | undefined,
  ): Promise<CollectionPolicyOutput> {
    await assertSiteScope(user, input.siteId, this.scope, { requiredRole: 'admin' })
    const layers = await this.repository.loadLayers(input.siteId)
    return toSafePolicy(resolvePolicy({ siteId: input.siteId, layers }))
  }

  async update(
    input: CollectionPolicyUpdateInput,
    user: AuthUser | undefined,
  ): Promise<CollectionPolicyUpdateOutput> {
    if (input.scope === 'installation') {
      assertInstallationAdmin(user)
      const lease = await this.lock.acquire('collection_policy')
      if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
      try {
        await this.assertNoActiveLifecycleOperation()
        const values = policyValues(input.policy)
        assertPolicyIsValid(values)
        const committed = await this.repository.commitRevision({
          target: { scope: 'installation' },
          values,
          revisionId: this.ids.collectionPolicyRevisionId(),
          changedBy: user?.id ?? null,
          now: this.clock(),
        })
        return { scope: 'installation', ...committed.layers.installation.values }
      } finally {
        await lease.release()
      }
    }

    const siteId = input.policy.siteId
    await assertSiteManagementScope(user, siteId, this.scope)
    if (!(await this.scope.siteScope.isActive(siteId))) {
      throw new ORPCError('CONFLICT', { status: 409 })
    }
    const lease = await this.lock.acquire('collection_policy')
    if (lease === undefined) throw new ORPCError('CONFLICT', { status: 409 })
    try {
      await this.assertNoActiveLifecycleOperation()
      const values = policyValues(input.policy)
      assertPolicyIsValid(values)
      const committed = await this.repository.commitRevision({
        target: { scope: 'site', siteId },
        values,
        revisionId: this.ids.collectionPolicyRevisionId(),
        changedBy: user?.id ?? null,
        now: this.clock(),
      })
      return {
        scope: 'site',
        siteId,
        ...(committed.layers.site?.values ?? input.policy),
      }
    } finally {
      await lease.release()
    }
  }

  async admit(input: AdmissionInput): Promise<AdmissionDecision> {
    if (!(await this.scope.siteScope.isActive(input.siteId))) {
      throw new ORPCError('NOT_FOUND')
    }
    const layers = await this.repository.loadLayers(input.siteId)
    return evaluateAdmission({
      resolution: resolvePolicy({ siteId: input.siteId, layers }),
      input,
      evaluatedAt: this.clock(),
    })
  }

  private async assertNoActiveLifecycleOperation(): Promise<void> {
    const active = await this.lifecycle.getActiveOperation()
    if (active === null || active.errorCode !== null) return
    throw new ORPCError('CONFLICT', { status: 409 })
  }
}

function policyValues(input: CollectionPolicyUpdateInput['policy']): PolicyValues {
  if (!('siteId' in input)) return input
  return {
    anonymousCollection: input.anonymousCollection,
    honorGpcDnt: input.honorGpcDnt,
    consentMode: input.consentMode,
    botPolicy: input.botPolicy,
    captureQueryStrings: input.captureQueryStrings,
    urlPolicy: input.urlPolicy,
    propertyPolicy: input.propertyPolicy,
    profileFilterKeys: input.profileFilterKeys,
    exclusions: input.exclusions,
  }
}

function assertPolicyIsValid(values: PolicyValues): void {
  try {
    validatePolicyCombination(values)
  } catch (error) {
    if (error instanceof PolicyValidationError) {
      throw new ORPCError('BAD_REQUEST', { status: 400 })
    }
    throw error
  }
}

function toSafePolicy(resolution: ReturnType<typeof resolvePolicy>): CollectionPolicyOutput {
  return {
    installationDefault: {
      scope: 'installation',
      ...resolution.installationDefault,
    },
    siteOverride:
      resolution.siteOverride === null
        ? null
        : {
            scope: 'site',
            siteId: resolution.siteId,
            ...resolution.siteOverride,
          },
    effective: {
      scope: 'site',
      siteId: resolution.siteId,
      ...resolution.effective.values,
    },
    source: resolution.provenance,
  }
}
