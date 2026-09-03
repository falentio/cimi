import type { OrganizationAuthority } from '@cimi/auth'
import type { Db } from '@cimi/db'
import { OrganizationRepositoryDrizzle } from './repository.drizzle.ts'
import { organizationRouter } from './router.ts'
import { OrganizationService, type OrganizationMembershipReconciler } from './service.ts'

export { organizationRouter }
export {
  OrganizationService,
  type OrganizationMembershipReconciler,
  type OrganizationServiceDependencies,
} from './service.ts'
export {
  OrganizationRepositoryDrizzle,
  type OrganizationRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export { isOwnerInvariantValid } from './owner-invariant.ts'
export type { OrganizationRecord, OrganizationRepository, OrganizationRole } from './repository.ts'

export interface CreateOrganizationDependencies {
  readonly db: Db
  readonly authority: OrganizationAuthority
  readonly membership?: OrganizationMembershipReconciler | undefined
}

export function createOrganization({ db, authority, membership }: CreateOrganizationDependencies) {
  const repository = new OrganizationRepositoryDrizzle({ db })
  const service = new OrganizationService({ repository, authority, membership })
  const router = organizationRouter(service)
  return { service, router }
}

export type OrganizationModule = ReturnType<typeof createOrganization>
