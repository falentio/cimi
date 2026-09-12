import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AnalyticsDb, Db } from '@cimi/db'
import { createCalendarDate, createSiteId, resolveReportPeriods } from '@cimi/kernel'
import { ReportingEvidenceDrizzleDuckDb } from '../evidence.drizzle-duckdb.ts'

const periods = resolveReportPeriods({
  metadata: { siteId: createSiteId('ste-1'), reportingTimezone: 'UTC', weekStartsOn: 'monday' },
  current: { fromDate: createCalendarDate('2026-09-05'), toDate: createCalendarDate('2026-09-06') },
})

function createAdapter(factCardinality: number, projectedFactCardinality: number | null) {
  const analytics = mock<AnalyticsDb>()
  analytics.readProjectionSnapshot.mockResolvedValue({
    checkpoint: {
      projectedAcceptanceSequence: 42,
      projectedFactCardinality,
      occurrenceCoveredFrom: null,
      occurrenceCoveredThrough: null,
      statisticsRefreshedAt: null,
      readiness: 'ready',
    },
    openGaps: [],
    factCardinality,
  })
  const db = mock<Db>()
  db.select.mockReturnValue({
    from: () => ({ where: () => ({ limit: async () => [] }) }),
  } as never)
  return new ReportingEvidenceDrizzleDuckDb({ db, analytics })
}

describe('reporting evidence statistics alignment', () => {
  it('reports aligned only when the count matches the published cardinality', async () => {
    const evidence = await createAdapter(100, 100).read({
      siteId: createSiteId('ste-1'),
      periods,
      coverage: ['event-occurrence'],
    })

    expect(evidence.projection.checkpoint.projectedFactCardinality).toBe(100)
    expect(evidence.statistics).toMatchObject({ state: 'aligned', factCardinality: 100 })
  })

  it('reports stale when the count disagrees with the published cardinality', async () => {
    const evidence = await createAdapter(100, 99).read({
      siteId: createSiteId('ste-1'),
      periods,
      coverage: ['event-occurrence'],
    })

    expect(evidence.statistics).toMatchObject({ state: 'stale', factCardinality: 100 })
  })

  it('reports stale when the checkpoint publishes no cardinality', async () => {
    const evidence = await createAdapter(100, null).read({
      siteId: createSiteId('ste-1'),
      periods,
      coverage: ['event-occurrence'],
    })

    expect(evidence.statistics).toMatchObject({ state: 'stale' })
  })
})
