import type { OrganizationAuthority } from '@cimi/auth'
import type { Db } from '@cimi/db'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import { InvitationRepositoryDrizzle } from './repository.drizzle.ts'
import { invitationRouter } from './router.ts'
import { createInvitationScopeDependencies } from './scope.ts'
import { InvitationService } from './service.ts'

export { invitationRouter }
export { InvitationService, type InvitationServiceDependencies } from './service.ts'
export {
  InvitationRepositoryDrizzle,
  type InvitationRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type { InvitationRepository } from './repository.ts'
export { createInvitationScopeDependencies, type InvitationScopeDependencies } from './scope.ts'
export { hashInvitationToken, mintInvitationToken, type TokenHash } from './token.ts'

export interface CreateInvitationDependencies {
  db: Db
  authority: OrganizationAuthority
  membership?: OrganizationMembershipReconciler | undefined
}

export function createInvitation({ db, authority, membership }: CreateInvitationDependencies) {
  const repository = new InvitationRepositoryDrizzle({ db })
  const scope = createInvitationScopeDependencies({ db })
  const service = new InvitationService({ repository, scope, authority, membership })
  const router = invitationRouter(service)
  return { service, router }
}

export type InvitationModule = ReturnType<typeof createInvitation>
