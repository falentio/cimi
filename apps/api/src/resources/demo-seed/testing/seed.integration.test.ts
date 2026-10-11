import { describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { schema, type AnalyticsDb } from '@cimi/db'
import { isFunctionValue } from '@cimi/utils'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

type Fixture = Awaited<ReturnType<typeof createApiTestFixture>>

type SiteDb = Fixture['db']

type AppendInput = Parameters<AnalyticsDb['appendProjectedEvents']>[0]

const LATE_WINDOW_MS = 15 * 60 * 1000

function acceptedEventCount(db: SiteDb) {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.TAcceptedEvent)
    .all()

  return Number(rows[0]?.count ?? 0)
}

function siteIdOf(db: SiteDb) {
  return db.select({ id: schema.TSite.id }).from(schema.TSite).all()[0]?.id
}

/**
 * Records the projection request instead of running it. The projection is the db package's own
 * pinned behaviour, and running it here spends the CPU every other analytics test needs.
 */
function recordingAnalytics(appends: AppendInput[]) {
  return (analytics: AnalyticsDb): AnalyticsDb =>
    new Proxy(analytics, {
      get(target, property) {
        // SAFETY: Proxy trap scopes dynamic keys to the wrapped database own keys.
        const value: unknown = target[property as keyof AnalyticsDb]

        if (property === 'appendProjectedEvents') {
          return (input: AppendInput) => {
            appends.push(input)

            return Promise.resolve({
              appendedEventCount: 0,
              appendedPropertyCount: 0,
              appendedVisitorCount: 0,
              appendedSessionCount: 0,
              chunkCount: 0,
              projectedReplaySequence: 0,
              projectedFactCardinality: 0,
              projectionGeneration: 0,
            })
          }
        }

        return isFunctionValue(value) ? value.bind(target) : value
      },
    })
}

describe('ensurePersonal seeds the demo site', () => {
  it('writes the seeded fabric off the ensure request and asks to project it', async () => {
    const appends: AppendInput[] = []

    await using fixture = await createApiTestFixture({
      demoSeed: true,
      wrapAnalytics: recordingAnalytics(appends),
    })

    const { app, db } = fixture
    const owner = await signUpTestUser(app, 'seed-owner@example.com', 'Seed Owner')

    const initialized = await apiTestRequest(
      app,
      '/installation/initializeInstallation',
      owner.cookie,
      {},
    )

    expect(initialized.status).toBe(201)

    const ensured = await apiTestRequest(
      app,
      '/organization/ensurePersonalOrganization',
      owner.cookie,
      {},
    )

    expect(ensured.status, await ensured.clone().text()).toBe(200)
    expect(siteIdOf(db)).toBeUndefined()
    expect(acceptedEventCount(db)).toBe(0)

    await vi.waitFor(
      () => {
        expect(acceptedEventCount(db)).toBeGreaterThan(20_000)
      },
      { timeout: 60_000, interval: 500 },
    )

    const siteId = siteIdOf(db) ?? ''

    const seeded = db
      .select({
        siteId: schema.TAcceptedEvent.siteId,
        late: schema.TAcceptedEvent.late,
        occurrenceTime: schema.TAcceptedEvent.occurrenceTime,
        receiptTime: schema.TAcceptedEvent.receiptTime,
      })
      .from(schema.TAcceptedEvent)
      .all()

    const journal = db.select().from(schema.TEventAcceptanceJournal).all()
    const cutoff = Math.max(...seeded.map((row) => row.receiptTime.getTime())) - LATE_WINDOW_MS

    expect(new Set(seeded.map((row) => row.siteId))).toEqual(new Set([siteId]))
    expect(journal.length).toBe(seeded.length)
    expect(new Set(journal.map((row) => row.replaySequence)).size).toBe(seeded.length)
    expect(
      seeded.filter((row) => row.occurrenceTime.getTime() < cutoff).every((row) => row.late),
    ).toBe(true)
    expect(
      seeded.filter((row) => row.occurrenceTime.getTime() >= cutoff).some((row) => row.late),
    ).toBe(false)
    expect(appends).toEqual([{ controlDb: db, siteId }])
  }, 90_000)
})
