import type { AuthUser } from '@cimi/auth'
import { schema as contractSchema } from '@cimi/contract'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { InMemorySiteMembership, InMemorySiteRecord } from '@cimi/guard'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import type { LifecycleOperationStatus } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import { evaluateAdmission } from './evaluator.ts'
import type { CollectionPolicyRepository } from './repository.ts'
import { CollectionPolicyService } from './service.ts'
import { resolvePolicy, type PolicyLayers, type PolicyValues } from './model.ts'

export interface CollectionPolicyFixtureOptions {
  readonly sites?: readonly InMemorySiteRecord[]
  readonly memberships?: readonly InMemorySiteMembership[]
  readonly activeOperation?: LifecycleOperationStatus | null
  readonly clock?: (() => Date) | undefined
}

export function createCollectionPolicyFixture(options: CollectionPolicyFixtureOptions = {}) {
  const repository = mock<CollectionPolicyRepository>()
  repository.loadLayers.mockResolvedValue(createPolicyLayers())
  repository.commitRevision.mockImplementation(async (input) => {
    const revision =
      input.values === null
        ? null
        : {
            id: input.revisionId,
            version: input.target.scope === 'site' ? 1 : 2,
            target: input.target,
            values: input.values,
          }
    const layers: PolicyLayers =
      input.target.scope === 'site'
        ? { installation: createPolicyLayers().installation, site: revision }
        : { installation: revision ?? createPolicyLayers().installation, site: null }
    const resolution =
      input.target.scope === 'site' ? resolvePolicy({ siteId: input.target.siteId, layers }) : null
    return { layers, resolution }
  })
  const lock = new InMemoryLifecycleLock()
  const scope = new InMemorySiteScopePort(
    options.sites ?? [{ siteId: 'ste_1', organizationId: 'org_1' }],
    options.memberships ?? [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
  )
  const lifecycle = new InMemoryLifecycleOperationStatusReader()
  if (options.activeOperation !== undefined) lifecycle.setActiveOperation(options.activeOperation)
  const service = new CollectionPolicyService({
    repository,
    lock,
    scope: { siteScope: scope, membership: scope },
    lifecycle,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ids: { collectionPolicyRevisionId: () => 'cpr_fixed' },
  })
  return { repository, lock, scope, lifecycle, service }
}

export function createPolicyLayers(
  installation: PolicyValues = contractSchema.DEFAULT_COLLECTION_POLICY,
  site: PolicyValues | null = null,
): PolicyLayers {
  return {
    installation: {
      id: 'cpr_installation_1',
      version: 1,
      target: { scope: 'installation' },
      values: installation,
    },
    site:
      site === null
        ? null
        : {
            id: 'cpr_site_1',
            version: 1,
            target: { scope: 'site', siteId: 'ste_1' },
            values: site,
          },
  }
}

export function createTestAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user_1',
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test',
    banned: false,
    role: 'member',
    ...overrides,
  }
}

export function createDecisionFixture() {
  const layers = createPolicyLayers()
  return evaluateAdmission({
    resolution: resolvePolicy({ siteId: 'ste_1', layers }),
    input: { siteId: 'ste_1', path: '/home' },
    evaluatedAt: new Date('2026-09-05T00:00:00.000Z'),
  })
}
