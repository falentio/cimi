import { describe, expect, it } from 'vitest'
import { DuckDbReportingQuery } from '@cimi/db'
import {
  InMemoryLifecycleLock,
  ReportingAdmissionService,
  type EventOverviewQuery,
  type ReportingQueryPort,
} from '@cimi/kernel'
import { createSiteScopeDependencies } from '../../site/scope.ts'
import {
  ReportingEvidenceDrizzleDuckDb,
  ReportingMetadataDrizzle,
  createReportingReadinessPort,
} from '../../traffic-report/index.ts'
import { EventReportService } from '../service.ts'
import { createApiTestFixture } from '../../../testing/fixture.ts'
import {
  createOwnerSite,
  readyLifecycle,
  seedAcceptedEvents,
} from '../../../testing/reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

async function buildOwner(email: string) {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { siteId } = await createOwnerSite(fixture.app, fixture.db, email)
  seedAcceptedEvents(fixture.db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: Date.parse(`${DAY_ONE}T10:00:00.000Z`),
      pagePath: '/a',
    },
  ])
  await fixture.analytics.rebuild({ controlDb: fixture.db })

  const admission = new ReportingAdmissionService({
    metadata: new ReportingMetadataDrizzle({ db: fixture.db }),
    evidence: new ReportingEvidenceDrizzleDuckDb({ db: fixture.db, analytics: fixture.analytics }),
    analyticsReadiness: createReportingReadinessPort({
      health: { db: fixture.db, analytics: fixture.analytics, dataDirectoryReady: true },
      lifecycle: readyLifecycle(),
    }),
  })
  const owner = fixture.db.$client
    .prepare('SELECT user_id AS userId FROM auth_member ORDER BY created_at LIMIT 1')
    .get() as { userId: string } | undefined
  if (owner === undefined) throw new Error('createOwnerSite did not seed an owner membership')
  return { fixture, admission, siteId, userId: owner.userId }
}

function serviceOver(input: {
  fixture: Awaited<ReturnType<typeof buildOwner>>['fixture']
  admission: ReportingAdmissionService
  lock: InMemoryLifecycleLock
  query?: ReportingQueryPort
}) {
  return new EventReportService({
    admission: input.admission,
    query: input.query ?? new DuckDbReportingQuery({ analytics: input.fixture.analytics }),
    profileFilterKeys: {
      async getProfileFilterKeys() {
        return []
      },
    },
    scope: createSiteScopeDependencies({ db: input.fixture.db }),
    lifecycleLock: input.lock,
  })
}

const overview = (siteId: string) => ({
  siteId,
  fromDate: DAY_ONE,
  toDate: DAY_TWO,
  eventKind: 'page_view' as const,
})

describe('EventReportService.lifecycle', () => {
  it('holds the shared analytics-read lease across admission and the query read', async () => {
    const owner = await buildOwner('event-holds@example.com')
    await using _ = owner.fixture
    const lock = new InMemoryLifecycleLock()
    const base = new DuckDbReportingQuery({ analytics: owner.fixture.analytics })
    let deletionRefusedDuringRead: boolean | undefined
    const query: ReportingQueryPort = new Proxy(base, {
      get(target, property, receiver) {
        if (property === 'eventOverview') {
          return async (input: EventOverviewQuery) => {
            deletionRefusedDuringRead = lock.acquire('site_deletion') === undefined
            return target.eventOverview(input)
          }
        }
        const value = Reflect.get(target, property, receiver) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })

    const service = serviceOver({ ...owner, lock, query })
    const result = await service.getOverview(overview(owner.siteId), { id: owner.userId })

    expect(result.fromDate).toBe(DAY_ONE)
    expect(
      deletionRefusedDuringRead,
      'a site deletion must be refused while a report read is in flight',
    ).toBe(true)
    const after = lock.acquire('site_deletion')
    expect(after, 'the lease releases once the read completes').toBeDefined()
    await after?.release()
  })

  it('releases the shared lease when the read fails after admission', async () => {
    const owner = await buildOwner('event-release@example.com')
    await using _ = owner.fixture
    const lock = new InMemoryLifecycleLock()
    const query: ReportingQueryPort = new Proxy(
      new DuckDbReportingQuery({ analytics: owner.fixture.analytics }),
      {
        get(target, property, receiver) {
          if (property === 'eventOverview') {
            return async () => {
              throw new Error('projection read failed')
            }
          }
          const value = Reflect.get(target, property, receiver) as unknown
          return typeof value === 'function' ? value.bind(target) : value
        },
      },
    )
    const service = serviceOver({ ...owner, lock, query })

    await expect(
      service.getOverview(overview(owner.siteId), { id: owner.userId }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    const after = lock.acquire('site_deletion')
    expect(after, 'a failed read must not leave the shared lease held').toBeDefined()
    await after?.release()
  })

  it('fails closed with SERVICE_UNAVAILABLE when an exclusive lifecycle lease is held', async () => {
    const owner = await buildOwner('event-failclosed@example.com')
    await using _ = owner.fixture
    const lock = new InMemoryLifecycleLock()
    const exclusive = lock.acquire('site_deletion')
    if (exclusive === undefined) throw new Error('Expected an exclusive lifecycle lease')
    const service = serviceOver({ ...owner, lock })

    await expect(
      service.getOverview(overview(owner.siteId), { id: owner.userId }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    await exclusive.release()
    expect(lock.isLocked()).toBe(false)
  })

  it('still serves a read while backup holds the compatible lifecycle lease', async () => {
    const owner = await buildOwner('event-backup@example.com')
    await using _ = owner.fixture
    const lock = new InMemoryLifecycleLock()
    const backup = lock.acquire('backup')
    if (backup === undefined) throw new Error('Expected a backup lease')
    const service = serviceOver({ ...owner, lock })

    const result = await service.getOverview(overview(owner.siteId), { id: owner.userId })

    expect(result.fromDate).toBe(DAY_ONE)
    await backup.release()
  })
})
