import { schema, type Db } from '@cimi/db'
import { and, eq } from 'drizzle-orm'
import type { LifecycleLock, RetentionResolver } from '@cimi/kernel'
import type { CollectionPolicyService } from '../collection-policy/service.ts'
import type { RetentionPolicyRepository } from '../retention-policy/repository.ts'
import { eventIngestionRouter, type EventIngestionRouterOptions } from './router.ts'
import { AcceptanceCoalescer } from './coalescer.ts'
import { AcceptanceRepositoryDrizzle } from './repository.drizzle.ts'
import { EventIngestionService } from './service.ts'
import type { IdentitySessionResolver, IngestionProtection } from './service.ts'
import { InMemoryIngestionProtection } from './protection.ts'
import { DefaultIdentitySessionResolver } from './identity-session.ts'
import type { SiteRepository } from '../site/repository.ts'
import { SiteRepositoryDrizzle } from '../site/repository.drizzle.ts'

export { eventIngestionRouter }
export type { EventIngestionRouterOptions } from './router.ts'
export {
  AcceptanceCoalescer,
  AcceptanceAdmissionStoppedError,
  AcceptanceQueueSaturatedError,
} from './coalescer.ts'
export type {
  AcceptanceDiagnosticsSnapshot,
  AcceptanceCoalescerDependencies,
  Reservation,
  ReservableCandidate,
} from './coalescer.ts'
export {
  AcceptanceRepositoryDrizzle,
  type AcceptanceRepositoryDrizzleDependencies,
} from './repository.drizzle.ts'
export {
  InMemoryIngestionProtection,
  type InMemoryIngestionProtectionDependencies,
} from './protection.ts'
export {
  DefaultIdentitySessionResolver,
  type DefaultIdentitySessionResolverDependencies,
} from './identity-session.ts'
export { isParsedPayloadOversized } from './payload-size.ts'
export { deriveAttribution, type DerivedAttribution } from './attribution.ts'
export {
  AcceptanceBackupRestoreCleanup,
  AcceptanceRetentionCleanup,
  type AcceptanceBackupRestoreCleanupDependencies,
  type AcceptanceRetentionCleanupDependencies,
} from './retention-cleanup.ts'
export type {
  AcceptanceCandidate,
  AcceptanceRepository,
  AcceptedEventRecord,
  EventInput,
  NormalizedEvent,
} from './repository.ts'
export {
  EventIngestionService,
  type CollectEventInput,
  type CollectEventOutput,
  type CollectEventsInput,
  type CollectEventsOutput,
  type EventIngestionServiceDependencies,
  type IdentitySessionAssignment,
  type IdentitySessionResolver,
  type IngestionProtection,
  type IngestionRequestContext,
} from './service.ts'

export interface CreateEventIngestionDependencies {
  readonly db: Db
  readonly siteRepository?: SiteRepository | undefined
  readonly collectionPolicy: CollectionPolicyService
  readonly retention: RetentionPolicyRepository | RetentionResolver
  readonly lifecycleLock?: LifecycleLock | undefined
  readonly protection?: IngestionProtection | undefined
  readonly identitySession?: IdentitySessionResolver | undefined
  readonly router?: EventIngestionRouterOptions | undefined
}

export function createEventIngestion({
  db,
  siteRepository,
  collectionPolicy,
  retention,
  lifecycleLock,
  protection,
  identitySession,
  router,
}: CreateEventIngestionDependencies) {
  const acceptanceRepository = new AcceptanceRepositoryDrizzle({ db })
  const coalescer = new AcceptanceCoalescer({ repository: acceptanceRepository })
  const service = new EventIngestionService({
    siteRepository: siteRepository ?? new SiteRepositoryDrizzle({ db }),
    collectionPolicy,
    retention,
    acceptance: acceptanceRepository,
    lifecycleLock,
    protection: protection ?? new InMemoryIngestionProtection(),
    identitySession:
      identitySession ??
      new DefaultIdentitySessionResolver({
        history: acceptanceRepository,
        references: {
          async exists(siteId, identifiedUserId) {
            const row = await db
              .select({ profileId: schema.TIdentityProfile.profileId })
              .from(schema.TIdentityProfile)
              .where(
                and(
                  eq(schema.TIdentityProfile.siteId, siteId),
                  eq(schema.TIdentityProfile.identifiedUserId, identifiedUserId),
                  eq(schema.TIdentityProfile.status, 'active'),
                ),
              )
              .limit(1)
            return row[0] !== undefined
          },
        },
      }),
    coalescer,
  })
  return {
    acceptanceRepository,
    coalescer,
    service,
    router: eventIngestionRouter(service, router),
  }
}

export type EventIngestionModule = ReturnType<typeof createEventIngestion>
