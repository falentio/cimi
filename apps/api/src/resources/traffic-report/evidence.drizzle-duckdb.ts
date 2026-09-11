import { eq } from 'drizzle-orm'
import { schema, type AnalyticsDb, type Db } from '@cimi/db'
import {
  createInstantMs,
  type AlignedStatistics,
  type CoverageDependency,
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

/**
 * Reads a report window's evidence from its two stores. The projection snapshot is DuckDB and
 * the retention cutoffs are SQLite; both projection and statistics come out of one
 * `readProjectionSnapshot` call, so the aligned-statistics assertion in the kernel compares two
 * values read from the same checkpoint.
 */
export class ReportingEvidenceDrizzleDuckDb implements ReportingEvidencePort {
  constructor(private readonly deps: ReportingEvidenceDrizzleDuckDbDependencies) {}

  async read(request: ReportingEvidenceRequest): Promise<ReportingEvidence> {
    const snapshot = await this.deps.analytics.readProjectionSnapshot({ siteId: request.siteId })
    const retention = await this.readRetention(request.siteId, request.coverage)
    const checkpoint = snapshot.checkpoint
    const projection: ProjectionEvidence = {
      checkpoint: {
        projectedAcceptanceSequence: checkpoint?.projectedAcceptanceSequence ?? 0,
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
  private async readRetention(
    siteId: string,
    dependencies: readonly CoverageDependency[],
  ): Promise<RetentionCoverage> {
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

/**
 * Statistics are aligned because the cardinality is counted from the same checkpoint the
 * projection reports, so the two sequences are equal by construction and the kernel's alignment
 * assertion holds.
 *
 * A checkpoint that is absent, or present but not `ready`, has no trustworthy projection to count
 * against; those return `unknown` so the kernel rejects the request instead of reporting an
 * empty Site. Note that a Site rebuilt from an empty journal yields a `ready` checkpoint with a
 * zero sequence and zero cardinality, which is a legitimate empty Site and admits.
 */
function resolveStatistics(
  checkpoint: {
    readonly projectedAcceptanceSequence: number
    readonly readiness: string
  } | null,
  factCardinality: number,
): AlignedStatistics | undefined {
  if (checkpoint === null || checkpoint.readiness !== 'ready') {
    return { state: 'unknown', asOfAcceptanceSequence: null, factCardinality: null }
  }
  return {
    state: 'aligned',
    asOfAcceptanceSequence: checkpoint.projectedAcceptanceSequence,
    factCardinality,
  }
}
