import { describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { schema } from '@cimi/db'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

type Fixture = Awaited<ReturnType<typeof createApiTestFixture>>

type ProjectionSnapshot = Awaited<ReturnType<Fixture['analytics']['readProjectionSnapshot']>>

const LATE_WINDOW_MS = 15 * 60 * 1000

const projectedSequence = (snapshot: ProjectionSnapshot) =>
  snapshot.checkpoint?.projectedAcceptanceSequence ?? 0

function siteIdOf(db: Fixture['db']) {
  return db.select({ id: schema.TSite.id }).from(schema.TSite).all()[0]?.id
}

function acceptedEventCount(db: Fixture['db']) {
  const rows = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.TAcceptedEvent)
    .all()

  return Number(rows[0]?.count ?? 0)
}

describe('ensurePersonal seeds the demo site', () => {
  it('writes the seeded fabric off the ensure response path and projects it', async () => {
    await using fixture = await createApiTestFixture()
    const { app, db, analytics } = fixture
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
    await vi.waitFor(
      async () => {
        const snapshot = await analytics.readProjectionSnapshot({ siteId })

        expect(projectedSequence(snapshot)).toBe(acceptedEventCount(db))
      },
      { timeout: 60_000, interval: 500 },
    )

    const journal = db.select().from(schema.TEventAcceptanceJournal).all()

    const seeded = db
      .select({
        siteId: schema.TAcceptedEvent.siteId,
        late: schema.TAcceptedEvent.late,
        occurrenceTime: schema.TAcceptedEvent.occurrenceTime,
        receiptTime: schema.TAcceptedEvent.receiptTime,
      })
      .from(schema.TAcceptedEvent)
      .all()

    const receipts = seeded.map((row) => row.receiptTime.getTime())
    const cutoff = Math.max(...receipts) - LATE_WINDOW_MS

    expect(journal.length).toBe(seeded.length)
    expect(new Set(journal.map((row) => row.replaySequence)).size).toBe(seeded.length)
    expect(new Set(seeded.map((row) => row.siteId))).toEqual(new Set([siteId]))
    expect(
      seeded.filter((row) => row.occurrenceTime.getTime() < cutoff).every((row) => row.late),
    ).toBe(true)
    expect(
      seeded.filter((row) => row.occurrenceTime.getTime() >= cutoff).some((row) => row.late),
    ).toBe(false)
  }, 150_000)
})
