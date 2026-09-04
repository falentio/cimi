import { InMemorySiteScopePort } from '@cimi/guard'
import type { InMemorySiteMembership, InMemorySiteRecord } from '@cimi/guard'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { RetentionPolicyRepository } from './repository.ts'
import { RetentionPolicyService, type RetentionPolicyIdFactory } from './service.ts'

export interface RetentionPolicyFixtureOptions {
  readonly sites?: readonly InMemorySiteRecord[]
  readonly memberships?: readonly InMemorySiteMembership[]
  readonly clock?: (() => Date) | undefined
  readonly ids?: RetentionPolicyIdFactory | undefined
}

const updatedAt = '2026-09-01T00:00:00.000Z'

export function createRetentionPolicyFixture(options: RetentionPolicyFixtureOptions = {}) {
  const repository = mock<RetentionPolicyRepository>()
  const lock = new InMemoryLifecycleLock()
  const scope = new InMemorySiteScopePort(
    options.sites ?? [{ siteId: 'ste_1', organizationId: 'org_1' }],
    options.memberships ?? [{ organizationId: 'org_1', userId: 'user_1', role: 'owner' }],
  )
  const service = new RetentionPolicyService({
    repository,
    lock,
    scope: { siteScope: scope, membership: scope },
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.ids === undefined ? {} : { ids: options.ids }),
  })
  return { repository, lock, scope, service }
}

export function createStoredResolution(
  overrides: Partial<RetentionPolicyRepository.StoredResolution> = {},
): RetentionPolicyRepository.StoredResolution {
  const installationDefault = { eventMonths: 12, profileMonths: 12, replayMonths: null }
  return {
    installationId: 'ins_1',
    installationDefault,
    siteOverride: null,
    effectivePolicy: installationDefault,
    updatedAt,
    ...overrides,
  }
}
