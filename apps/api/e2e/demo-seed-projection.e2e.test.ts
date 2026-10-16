import { call } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { expect, test } from 'vitest'
import { closeDb, createDb, schema, type Db } from '@cimi/db'
import { createApiE2eFixture } from './fixture.ts'

/** The default window keeps the suite cheap; CIMI_DEMO_SEED_HISTORY_DAYS=90 runs the acceptance volume. */
const HISTORY_DAYS = Number(process.env['CIMI_DEMO_SEED_HISTORY_DAYS'] ?? 3)

/**
 * An acceptance-volume seed plus its projection has taken 13-42 s on a loaded machine, so the
 * poll budget has to outlast a slower CI runner while the test budget stays above it.
 */
const CONVERGENCE_BUDGET_MS = 180_000

const TEST_BUDGET_MS = 300_000

const ACCEPTANCE_HISTORY_DAYS = 90

const MS_PER_DAY = 86_400_000

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function dayString(at: Date): string {
  return at.toISOString().slice(0, 10)
}

function acceptedEventCount(db: Db, siteId: string): number {
  return db
    .select({ value: schema.TAcceptedEvent.eventPk })
    .from(schema.TAcceptedEvent)
    .where(eq(schema.TAcceptedEvent.siteId, siteId))
    .all().length
}

function maxReplaySequence(db: Db, siteId: string): number {
  const rows = db
    .select({ value: schema.TAcceptedEvent.replaySequence })
    .from(schema.TAcceptedEvent)
    .where(eq(schema.TAcceptedEvent.siteId, siteId))
    .all()

  return rows.reduce((highest, row) => Math.max(highest, row.value), 0)
}

test(
  'projects a seeded demo site through the append and answers its traffic query',
  async () => {
    await using fixture = await createApiE2eFixture({
      demoSeedHistoryDays: HISTORY_DAYS,
      startRetentionCleanupWorker: true,
      retentionCleanupIntervalMs: 50,
    })

    const controlDb = createDb({ path: fixture.controlDatabasePath })
    const owner = await fixture.createUser('demo-projection@example.com', 'Demo Projection')

    try {
      await call(
        fixture.router.installation.initializeInstallation,
        {},
        { context: await owner.context() },
      )
      await call(
        fixture.router.retentionPolicy.updateRetentionPolicy,
        {
          scope: 'installation',
          policy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
        },
        { context: await owner.context() },
      )
      const samples: boolean[] = []
      let sampling = true

      const sampler = (async () => {
        while (sampling) {
          samples.push(await fixture.analytics.ready())

          await delay(20)
        }
      })()

      await call(
        fixture.router.organization.ensurePersonalOrganization,
        {},
        { context: await owner.context() },
      )

      const state = await fixture.waitFor({
        timeoutMs: CONVERGENCE_BUDGET_MS,
        label: 'the seeded demo site to converge',
        read: async () => {
          const siteId =
            controlDb.select({ id: schema.TSite.id }).from(schema.TSite).all()[0]?.id ?? ''

          const accepted = siteId === '' ? 0 : acceptedEventCount(controlDb, siteId)
          const snapshot = await fixture.analytics.readProjectionSnapshot({ siteId })

          return {
            siteId,
            accepted,
            checkpoint: snapshot.checkpoint,
            converged:
              accepted > 0 &&
              snapshot.checkpoint?.projectedFactCardinality === accepted &&
              snapshot.factCardinality === accepted,
          }
        },
        done: (value) => value.converged,
      })

      sampling = false
      await sampler

      const { siteId, accepted } = state

      const duck = await fixture.analytics.readWindowed(async (reader) => {
        const count = await reader.read('SELECT count(*) AS value FROM events WHERE site_id = ?', [
          siteId,
        ])

        const duplicates = await reader.read(
          'SELECT count(*) AS value FROM (SELECT site_id, event_id FROM events WHERE site_id = ? GROUP BY site_id, event_id HAVING count(*) > 1)',
          [siteId],
        )

        return {
          events: Number(count[0]?.['value'] ?? 0),
          duplicateGroups: Number(duplicates[0]?.['value'] ?? 0),
        }
      })

      expect(accepted).toBeGreaterThan(0)
      expect(duck.events).toBe(accepted)
      expect(state.checkpoint?.projectedFactCardinality).toBe(accepted)
      expect(state.checkpoint?.projectedAcceptanceSequence).toBe(
        maxReplaySequence(controlDb, siteId),
      )
      expect(duck.duplicateGroups).toBe(0)
      expect(samples.filter((value) => !value)).toEqual([])

      const today = new Date()

      const overview = await call(
        fixture.router.trafficReport.getTrafficOverview,
        {
          siteId,
          fromDate: dayString(new Date(today.getTime() - 89 * MS_PER_DAY)),
          toDate: dayString(today),
          granularity: 'day',
        },
        { context: await owner.context() },
      )

      expect(overview.trend).toHaveLength(90)

      if (HISTORY_DAYS >= ACCEPTANCE_HISTORY_DAYS) {
        expect(accepted).toBeGreaterThan(25_000)
      }
    } finally {
      closeDb(controlDb)
    }
  },
  TEST_BUDGET_MS,
)
