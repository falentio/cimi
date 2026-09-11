import type { Db } from '@cimi/db'
import { schema } from '@cimi/db'
import { eq } from 'drizzle-orm'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import type { LifecycleLock } from '@cimi/kernel'
import { createSiteScopeDependencies } from '../site/scope.ts'
import type { OrganizationMembershipReconciler } from '../organization/service.ts'
import { SiteRepositoryDrizzle } from '../site/repository.drizzle.ts'
import type { SiteRepository } from '../site/repository.ts'
import { IdentityProfileRepositoryDrizzle } from './repository.drizzle.ts'
import type { IdentityProfileIdFactory } from './repository.ts'
import { identityProfileRouter, type IdentityProfileRouterOptions } from './router.ts'
import { IdentityProfileService, type IdentityProfileProtection } from './service.ts'
import type { CollectionPolicyService } from '../collection-policy/service.ts'

export { identityProfileRouter }
export type { IdentityProfileRouterOptions } from './router.ts'
export {
  IdentityProfileService,
  type IdentityProfileProtection,
  type IdentityProfileRequestContext,
  type IdentityProfileServiceDependencies,
} from './service.ts'
export {
  IdentityProfileRepositoryDrizzle,
  type IdentityProfileRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export type {
  ActiveIdentityProfile,
  IdentityDeletionStatus,
  IdentityProfile,
  IdentityProfileEpoch,
  IdentityProfileIdFactory,
  IdentityProfileList,
  IdentityProfileRepository,
} from './repository.ts'

export interface CreateIdentityProfileDependencies {
  readonly db: Db
  readonly collectionPolicy: CollectionPolicyService
  readonly siteRepository?: SiteRepository | undefined
  readonly scope?: SiteScopeGuardDependencies | undefined
  readonly membership?: OrganizationMembershipReconciler | undefined
  readonly protection?: IdentityProfileProtection | undefined
  readonly lifecycleLock: LifecycleLock
  readonly clock?: (() => Date) | undefined
  readonly ids?: IdentityProfileIdFactory | undefined
  readonly router?: IdentityProfileRouterOptions | undefined
}

export function createIdentityProfile({
  db,
  collectionPolicy,
  siteRepository,
  scope,
  membership,
  protection,
  lifecycleLock,
  clock,
  ids,
  router,
}: CreateIdentityProfileDependencies) {
  const repository = new IdentityProfileRepositoryDrizzle({
    db,
    ...(ids === undefined ? {} : { ids }),
  })
  const service = new IdentityProfileService({
    repository,
    siteRepository: siteRepository ?? new SiteRepositoryDrizzle({ db }),
    collectionPolicy,
    scope: scope ?? createSiteScopeDependencies({ db }),
    profileActivityCutoff: async (siteId) => {
      const row = await db
        .select({
          profileActivityCutoffAt: schema.TRetentionEffectiveCutoff.profileActivityCutoffAt,
        })
        .from(schema.TRetentionEffectiveCutoff)
        .where(eq(schema.TRetentionEffectiveCutoff.siteId, siteId))
        .limit(1)
      return row[0]?.profileActivityCutoffAt
    },
    ...(membership === undefined ? {} : { membership }),
    ...(protection === undefined ? {} : { protection }),
    lifecycleLock,
    ...(clock === undefined ? {} : { clock }),
  })
  return { repository, service, router: identityProfileRouter(service, router) }
}

export type IdentityProfileModule = ReturnType<typeof createIdentityProfile>
