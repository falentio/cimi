import {
  InMemorySiteScopePort,
  type InMemorySiteMembership,
  type InMemorySiteRecord,
} from '@cimi/guard'
import { mock } from 'vitest-mock-extended'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import type { SiteRepository } from './repository.ts'
import { SiteService } from './service.ts'

const createdAt = '2026-08-31T00:00:00.000Z'
const updatedAt = '2026-08-31T00:00:00.000Z'

export interface SiteFixtureOptions {
  readonly membership?: OrganizationMembershipReconciler | undefined
  readonly sites?: readonly InMemorySiteRecord[]
  readonly memberships?: readonly InMemorySiteMembership[]
}

export function createSiteFixture({ membership, sites, memberships }: SiteFixtureOptions = {}) {
  const repository = mock<SiteRepository>()
  const scope = new InMemorySiteScopePort(
    sites ?? [{ siteId: 'site_1', organizationId: 'organization_1' }],
    memberships ?? [{ organizationId: 'organization_1', userId: 'user_1', role: 'owner' }],
  )
  const reconciler = membership ?? createReconcilerMock()
  const service = new SiteService({
    repository,
    scope: { siteScope: scope, membership: scope },
    membership: reconciler,
  })
  return { repository, scope, membership: reconciler, service }
}

function createReconcilerMock(): OrganizationMembershipReconciler {
  const reconciler = mock<OrganizationMembershipReconciler>()
  reconciler.reconcile.mockResolvedValue(undefined)
  return reconciler
}

export function createSite(overrides: Partial<SiteRepository.Site> = {}): SiteRepository.Site {
  return {
    id: 'site_1',
    organizationId: 'organization_1',
    name: 'Production',
    hostname: 'example.com',
    ingestionIdentifier: 'ingest_1',
    reportingTimezone: 'UTC',
    weekStartsOn: 'monday',
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function createSiteRecord(
  overrides: Partial<SiteRepository.SiteRecord> = {},
): SiteRepository.SiteRecord {
  return {
    ...createSite(),
    status: 'active',
    deleteRequestedAt: null,
    deletedAt: null,
    recoveryDeadline: null,
    purgeAt: null,
    purgedAt: null,
    currentOperationId: null,
    cleanupStatus: 'not-required',
    cleanupUpdatedAt: null,
    cleanupError: null,
    ...overrides,
  }
}
