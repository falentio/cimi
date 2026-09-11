import { defaultFactWorkEstimator } from './fact-work.ts'
import { ReportingAdmissionError, queryLimitExceeded, serviceUnavailable } from './errors.ts'
import { findRelevantProjectionGap, resolveReportPeriods } from './interval.ts'
import { checkRetentionCoverage } from './retention.ts'
import type {
  AlignedStatistics,
  FactWorkEstimate,
  FreshnessEvidence,
  ProjectionEvidence,
  ReportAdmissionInput,
  ReportAdmissionTicket,
  ResolvedPeriod,
  ResolvedPeriods,
  RetentionCoverage,
} from './types.ts'
import type { ReportingAdmissionDependencies } from './ports.ts'

export class ReportingAdmissionService {
  readonly #dependencies: ReportingAdmissionDependencies

  constructor(dependencies: ReportingAdmissionDependencies) {
    this.#dependencies = dependencies
  }

  async admit(input: ReportAdmissionInput): Promise<ReportAdmissionTicket> {
    const health = await this.readPort(() => this.#dependencies.analyticsReadiness.getHealth())
    if (health.controlStore !== 'ready' || health.analyticsStore !== 'ready') {
      throw serviceUnavailable('analytics-not-ready')
    }

    const metadata = await this.readPort(() => this.#dependencies.metadata.getActive(input.siteId))
    if (metadata === undefined) {
      throw new ReportingAdmissionError({ code: 'NOT_FOUND', reason: 'metadata-missing' })
    }
    const periods = resolveReportPeriods({
      metadata,
      current: input.current,
      ...(input.comparison === undefined ? {} : { comparison: input.comparison }),
      ...(input.bucket === undefined ? {} : { bucket: input.bucket }),
    })

    const facts = await this.#readFacts(input, periods)

    checkRetentionCoverage({ coverage: facts.retention, required: input.coverage, periods })

    const bucketWork = input.work.bucketWork ?? countBucketStarts(periods)
    const factWorkPort = this.#dependencies.factWork ?? { estimate: defaultFactWorkEstimator }
    const estimate = await this.readPort(() =>
      factWorkPort.estimate({
        factCardinality: facts.statistics.factCardinality,
        extraMetricCount: input.work.extraMetricCount,
        bucketWork,
        dimensionCount: input.work.dimensionCount,
        filterCount: input.work.filterCount,
        distinctCountOperations: input.work.distinctCountOperations,
        budget: input.work.budget,
      }),
    )
    assertAdmittedFactWork(estimate, input.work.budget)

    return {
      periods,
      freshness: {
        current: resolveFreshness(periods.current, facts.projection),
        comparison:
          periods.comparison === null
            ? null
            : resolveFreshness(periods.comparison, facts.projection),
      },
      factWork: estimate,
    }
  }

  /**
   * Reads the window's preflight facts. With the deep port this is one transaction, so projection
   * and statistics cannot be torn apart by a concurrent rebuild. The narrow ports keep their
   * original stage-by-stage reads, including the fail-fast that skips retention when the gap gate
   * already rejects the request.
   */
  async #readFacts(
    input: ReportAdmissionInput,
    periods: ResolvedPeriods,
  ): Promise<{
    readonly projection: ProjectionEvidence
    readonly statistics: Extract<AlignedStatistics, { readonly state: 'aligned' }>
    readonly retention: RetentionCoverage
  }> {
    const dependencies = this.#dependencies
    if ('evidence' in dependencies) {
      const evidence = await this.readPort(() =>
        dependencies.evidence.read({ siteId: input.siteId, periods, coverage: input.coverage }),
      )
      const statistics: AlignedStatistics = evidence.statistics ?? {
        state: 'unknown',
        asOfAcceptanceSequence: null,
        factCardinality: null,
      }
      const aligned = requireAlignedStatistics(statistics, evidence.projection)
      rejectRelevantGap(evidence.projection, periods)
      return {
        projection: evidence.projection,
        statistics: aligned,
        retention: evidence.retention,
      }
    }

    const projection = await this.readPort(() => dependencies.projection.read(input.siteId))
    const statistics = await this.readPort(() =>
      dependencies.statistics.read({
        siteId: input.siteId,
        periods,
        coverage: input.coverage,
        projection,
      }),
    )
    const aligned = requireAlignedStatistics(statistics, projection)
    rejectRelevantGap(projection, periods)
    const retention = await this.readPort(() =>
      dependencies.retention.read({ siteId: input.siteId, dependencies: input.coverage }),
    )
    return { projection, statistics: aligned, retention }
  }

  private async readPort<T>(read: () => T | PromiseLike<T>): Promise<T> {
    try {
      return await read()
    } catch (cause) {
      throw serviceUnavailable('port-failure', cause)
    }
  }
}

function rejectRelevantGap(projection: ProjectionEvidence, periods: ResolvedPeriods): void {
  if (findRelevantProjectionGap(projection.openGaps, periods) !== undefined) {
    throw queryLimitExceeded('projection-gap')
  }
}

function requireAlignedStatistics(
  statistics: AlignedStatistics,
  projection: ProjectionEvidence,
): Extract<AlignedStatistics, { readonly state: 'aligned' }> {
  if (
    statistics.state !== 'aligned' ||
    statistics.asOfAcceptanceSequence !== projection.checkpoint.projectedAcceptanceSequence ||
    !Number.isFinite(statistics.factCardinality) ||
    statistics.factCardinality < 0
  ) {
    throw queryLimitExceeded('statistics-uncertain')
  }
  return statistics
}

function assertAdmittedFactWork(
  estimate: FactWorkEstimate | undefined,
  budget: number,
): asserts estimate is FactWorkEstimate {
  if (
    estimate === undefined ||
    !Number.isFinite(estimate.units) ||
    estimate.units < 0 ||
    !Number.isFinite(estimate.budget) ||
    estimate.budget !== budget
  ) {
    throw queryLimitExceeded('fact-work-uncertain')
  }
  if (estimate.units > budget) throw queryLimitExceeded('fact-work-over-budget')
}

function countBucketStarts(periods: ResolvedPeriods): number {
  return (
    (periods.current.bucketStarts?.length ?? 0) + (periods.comparison?.bucketStarts?.length ?? 0)
  )
}

function resolveFreshness(
  period: ResolvedPeriod,
  projection: ProjectionEvidence,
): FreshnessEvidence {
  const coveredThrough = projection.checkpoint.occurrenceCoveredThrough
  return {
    status:
      coveredThrough !== null && coveredThrough >= period.interval.endExclusive
        ? 'current'
        : 'stale',
    projectedAcceptanceSequence: projection.checkpoint.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough: coveredThrough,
  }
}
