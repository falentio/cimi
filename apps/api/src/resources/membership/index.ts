import type { OrganizationAuthority } from '@cimi/auth'
import type { Db } from '@cimi/db'
import { MembershipRepositoryDrizzle } from './repository.drizzle.ts'
import { membershipRouter } from './router.ts'
import { MembershipService } from './service.ts'

export { membershipRouter }
export { MembershipService, type MembershipServiceDependencies } from './service.ts'
export {
  MembershipRepositoryDrizzle,
  type MembershipRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { MembershipRecord, MembershipRepository } from './repository.ts'

export interface CreateMembershipDependencies {
  readonly db: Db
  readonly authority: OrganizationAuthority
}

export function createMembership({ db, authority }: CreateMembershipDependencies) {
  const repository = new MembershipRepositoryDrizzle({ db })
  const service = new MembershipService({ repository, authority })
  const router = membershipRouter(service)
  return { repository, service, router }
}

export type MembershipModule = ReturnType<typeof createMembership>
