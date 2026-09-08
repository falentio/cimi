import type { Db } from '@cimi/db'
import type { AcceptanceQuiescencePort, LifecycleLock, RetentionResolver } from '@cimi/kernel'
import type { CollectionPolicyService } from '../collection-policy/service.ts'
import type { RetentionPolicyRepository } from '../retention-policy/repository.ts'
import { eventIngestionRouter } from './router.ts'
import { AcceptanceCoalescer } from './coalescer.ts'
import { AcceptanceRepositoryDrizzle } from './repository.drizzle.ts'
import { EventIngestionService } from './service.ts'
import type { IdentitySessionResolver, IngestionProtection } from './service.ts'
import type { SiteRepository } from '../site/repository.ts'
import { SiteRepositoryDrizzle } from '../site/repository.drizzle.ts'

export { eventIngestionRouter }
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

export function combineAcceptanceQuiescence(
  primary: AcceptanceQuiescencePort,
  secondary: AcceptanceQuiescencePort,
): AcceptanceQuiescencePort {
  return {
    async stopAdmission() {
      await Promise.all([primary.stopAdmission(), secondary.stopAdmission()])
    },
    async drain() {
      const [first, second] = await Promise.all([primary.drain(), secondary.drain()])
      return { lastSafeSequence: Math.max(first.lastSafeSequence, second.lastSafeSequence) }
    },
    async resumeAdmission() {
      await Promise.all([primary.resumeAdmission(), secondary.resumeAdmission()])
    },
  }
}

export interface CreateEventIngestionDependencies {
  readonly db: Db
  readonly siteRepository?: SiteRepository | undefined
  readonly collectionPolicy: CollectionPolicyService
  readonly retention: RetentionPolicyRepository | RetentionResolver
  readonly lifecycleLock?: LifecycleLock | undefined
  readonly protection?: IngestionProtection | undefined
  readonly identitySession?: IdentitySessionResolver | undefined
}

export function createEventIngestion({
  db,
  siteRepository,
  collectionPolicy,
  retention,
  lifecycleLock,
  protection,
  identitySession,
}: CreateEventIngestionDependencies) {
  const acceptanceRepository = new AcceptanceRepositoryDrizzle({ db })
  const coalescer = new AcceptanceCoalescer({ repository: acceptanceRepository })
  const service = new EventIngestionService({
    siteRepository: siteRepository ?? new SiteRepositoryDrizzle({ db }),
    collectionPolicy,
    retention,
    acceptance: acceptanceRepository,
    lifecycleLock,
    protection,
    identitySession,
    coalescer,
  })
  return { acceptanceRepository, coalescer, service, router: eventIngestionRouter(service) }
}

export type EventIngestionModule = ReturnType<typeof createEventIngestion>
