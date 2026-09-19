import { eq } from 'drizzle-orm'
import { schema, type AnalyticsDb, type Db } from '@cimi/db'
import {
  createInstantMs,
  type AlignedStatistics,
  type ProjectionEvidence,
  type ReportingEvidence,
  type ReportingEvidencePort,
  type ReportingEvidenceRequest,
  type RetentionBoundary,
  type RetentionCoverage,
} from '@cimi/kernel'

export interface ReportingEvidenceDrizzleDuckDbDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
}

export class ReportingEvidenceDrizzleDuckDb implements ReportingEvidencePort {
  constructor(private readonly deps: ReportingEvidenceDrizzleDuckDbDependencies) {}

  async read(request: ReportingEvidenceRequest): Promise<ReportingEvidence> {
    const snapshot = await this.deps.analytics.readProjectionSnapshot({ siteId: request.siteId })
    const retention = await this.readRetention(request.siteId)
    const checkpoint = snapshot.checkpoint
    const projection: ProjectionEvidence = {
      checkpoint: {
        projectedAcceptanceSequence: checkpoint?.projectedAcceptanceSequence ?? 0,
        projectedFactCardinality: checkpoint?.projectedFactCardinality ?? null,
        projectionGeneration: checkpoint?.projectionGeneration ?? 0,
        occurrenceCoveredFrom:
          checkpoint?.occurrenceCoveredFrom === null ||
          checkpoint?.occurrenceCoveredFrom === undefined
            ? null
            : createInstantMs(checkpoint.occurrenceCoveredFrom.getTime()),
        occurrenceCoveredThrough:
          checkpoint?.occurrenceCoveredThrough === null ||
          checkpoint?.occurrenceCoveredThrough === undefined
            ? null
            : createInstantMs(checkpoint.occurrenceCoveredThrough.getTime()),
        statisticsRefreshedAt:
          checkpoint?.statisticsRefreshedAt === null ||
          checkpoint?.statisticsRefreshedAt === undefined
            ? null
            : createInstantMs(checkpoint.statisticsRefreshedAt.getTime()),
      },
      openGaps: snapshot.openGaps.map((gap) => ({
        id: gap.id,
        unbounded: gap.unbounded,
        occurrenceFrom:
          gap.occurrenceFrom === null ? null : createInstantMs(gap.occurrenceFrom.getTime()),
        occurrenceTo:
          gap.occurrenceTo === null ? null : createInstantMs(gap.occurrenceTo.getTime()),
      })),
    }
    return {
      projection,
      retention,
      statistics: resolveStatistics(checkpoint, snapshot.factCardinality),
    }
  }
  private async readRetention(siteId: string): Promise<RetentionCoverage> {
    const rows = await this.deps.db
      .select({
        eventOccurrenceCutoffAt: schema.TRetentionEffectiveCutoff.eventOccurrenceCutoffAt,
        profileActivityCutoffAt: schema.TRetentionEffectiveCutoff.profileActivityCutoffAt,
        replayReceiptCutoffAt: schema.TRetentionEffectiveCutoff.replayReceiptCutoffAt,
      })
      .from(schema.TRetentionEffectiveCutoff)
      .where(eq(schema.TRetentionEffectiveCutoff.siteId, siteId))
      .limit(1)
    const row = rows[0]
    if (row === undefined) {
      return {
        eventOccurrence: { state: 'unknown' },
        profileActivity: { state: 'unknown' },
        replayReceipt: { state: 'unknown' },
      }
    }
    return {
      eventOccurrence: availableFrom(row.eventOccurrenceCutoffAt),
      profileActivity: availableFrom(row.profileActivityCutoffAt),
      replayReceipt:
        row.replayReceiptCutoffAt === null
          ? { state: 'disabled' }
          : availableFrom(row.replayReceiptCutoffAt),
    }
  }
}

function availableFrom(value: Date): RetentionBoundary {
  return { state: 'available', from: createInstantMs(value.getTime()) }
}

function resolveStatistics(
  checkpoint: {
    readonly projectedAcceptanceSequence: number
    readonly projectedFactCardinality: number | null
    readonly readiness: string
  } | null,
  factCardinality: number,
): AlignedStatistics | undefined {
  if (checkpoint === null || checkpoint.readiness !== 'ready') {
    return { state: 'unknown', asOfAcceptanceSequence: null, factCardinality: null }
  }
  if (checkpoint.projectedFactCardinality !== factCardinality) {
    return {
      state: 'stale',
      asOfAcceptanceSequence: checkpoint.projectedAcceptanceSequence,
      factCardinality,
    }
  }
  return {
    state: 'aligned',
    asOfAcceptanceSequence: checkpoint.projectedAcceptanceSequence,
    factCardinality,
  }
}
