import type { AuthUser } from '@cimi/auth'
import { schema as contractSchema } from '@cimi/contract'
import { InMemorySiteScopePort } from '@cimi/guard'
import type { InMemorySiteMembership, InMemorySiteRecord } from '@cimi/guard'
import { InMemoryLifecycleLock, InMemoryLifecycleOperationStatusReader } from '@cimi/kernel'
import type { LifecycleOperationStatus } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { RetentionPolicyRepository } from './repository.ts'
import { RetentionPolicyService, type RetentionPolicyIdFactory } from './service.ts'

export interface RetentionPolicyFixtureOptions {
  readonly sites?: readonly InMemorySiteRecord[]
  readonly memberships?: readonly InMemorySiteMembership[]
  readonly activeOperation?: LifecycleOperationStatus | null
  readonly clock?: (() => Date) | undefined
  readonly ids?: RetentionPolicyIdFactory | undefined
}

const updatedAt = '2026-09-01T00:00:00.000Z'
export const defaultCleanup: RetentionPolicyRepository.CleanupSummary = {
  pending: false,
  derived: {
    status: 'not_applicable',
    startedAt: null,
    completedAt: null,
    errorCode: null,
  },
  backup: {
    status: 'not_applicable',
    startedAt: null,
    completedAt: null,
    errorCode: null,
  },
}

export function createRetentionPolicyFixture(options: RetentionPolicyFixtureOptions = {}) {
  const repository = mock<RetentionPolicyRepository>()
  repository.commitPolicyChange.mockImplementation(async (input) => {
    if (input.target.scope === 'installation') {
      if (input.policy === null) throw new Error('Installation retention policy cannot be cleared')
      const resolution = await repository.saveInstallationDefault({
        id: input.policyId,
        policy: input.policy,
        now: input.now,
      })
      return { resolution, affectedBoundaries: [], queuedRunIds: [] }
    }
    const resolution =
      input.policy === null
        ? await repository.clearSiteOverride({ siteId: input.target.siteId, now: input.now })
        : await repository.saveSiteOverride({
            id: input.policyId,
            siteId: input.target.siteId,
            policy: input.policy,
            now: input.now,
          })
    return { resolution, affectedBoundaries: [], queuedRunIds: [] }
  })
  const lock = new InMemoryLifecycleLock()
  const scope = new InMemorySiteScopePort(
    options.sites ?? [{ siteId: 'ste_1', organizationId: 'org_1' }],
    options.memberships ?? [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
  )
  const lifecycle = new InMemoryLifecycleOperationStatusReader()
  if (options.activeOperation !== undefined) lifecycle.setActiveOperation(options.activeOperation)
  const service = new RetentionPolicyService({
    repository,
    lock,
    scope: { siteScope: scope, membership: scope },
    lifecycle,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.ids === undefined ? {} : { ids: options.ids }),
  })
  return { repository, lock, scope, lifecycle, service }
}

export function createStoredResolution(
  overrides: Partial<RetentionPolicyRepository.StoredResolution> = {},
): RetentionPolicyRepository.StoredResolution {
  const installationDefault = { ...contractSchema.DEFAULT_RETENTION_POLICY }
  const { cleanup, ...rest } = overrides
  return {
    installationId: 'ins_1',
    installationDefault,
    siteOverride: null,
    effectivePolicy: { ...installationDefault },
    updatedAt,
    ...rest,
    cleanup: cleanup ?? defaultCleanup,
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
