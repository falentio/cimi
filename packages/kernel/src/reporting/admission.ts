import { defaultFactWorkEstimator } from './fact-work.ts'
import { queryLimitExceeded, reportingNotFound, serviceUnavailable } from './errors.ts'
import { createInstantMs } from './types.ts'
import {
  findRelevantProjectionGap,
  resolvePeriodSequence,
  resolveReportPeriods,
} from './interval.ts'
import { checkRetentionCoverage } from './retention.ts'
import type {
  AlignedStatistics,
  FactWorkEstimate,
  FreshnessEvidence,
  ProjectionEvidence,
  ReportAdmissionDemand,
  ReportAdmissionInput,
  ReportAdmissionPreparation,
  ReportAdmissionPreparationInput,
  ReportAdmissionTicket,
  ReportEvaluationPeriods,
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
    const preparation = await this.prepare({
      siteId: input.siteId,
      current: input.current,
      ...(input.comparison === undefined ? {} : { comparison: input.comparison }),
      ...(input.periodization === undefined ? {} : { periodization: input.periodization }),
      ...(input.bucket === undefined ? {} : { bucket: input.bucket }),
    })
    return this.admitPrepared(preparation, input)
  }

  async prepare(input: ReportAdmissionPreparationInput): Promise<ReportAdmissionPreparation> {
    const health = await this.readPort(() => this.#dependencies.analyticsReadiness.getHealth())
    if (health.controlStore !== 'ready' || health.analyticsStore !== 'ready') {
      throw serviceUnavailable('analytics-not-ready')
    }

    const metadata = await this.readPort(() => this.#dependencies.metadata.getActive(input.siteId))
    if (metadata === undefined) {
      throw reportingNotFound('metadata-missing')
    }
    const periods = resolveReportPeriods({
      metadata,
      current: input.current,
      ...(input.comparison === undefined ? {} : { comparison: input.comparison }),
      ...(input.bucket === undefined ? {} : { bucket: input.bucket }),
    })
    const evaluation = resolveEvaluationPeriods({
      metadata,
      periods,
      periodization: input.periodization,
    })

    return {
      input,
      periods,
      evaluation: {
        current: evaluation.current,
        comparison: evaluation.comparison,
        interval: evaluation.interval,
      },
      coveragePeriods: evaluation.coveragePeriods,
    }
  }

  async admitPrepared(
    preparation: ReportAdmissionPreparation,
    demand: ReportAdmissionDemand,
  ): Promise<ReportAdmissionTicket> {
    const facts = await this.#readFacts(
      { siteId: preparation.input.siteId, coverage: demand.coverage },
      preparation.coveragePeriods,
    )

    checkRetentionCoverage({
      coverage: facts.retention,
      required: demand.coverage,
      periods: preparation.coveragePeriods,
    })

    const bucketWork = demand.work.bucketWork ?? countBucketStarts(preparation.periods)
    const periodWork = preparation.evaluation.current.sequence?.length ?? 0
    const comparisonPeriodWork = preparation.evaluation.comparison?.sequence?.length ?? 0
    const factWorkPort = this.#dependencies.factWork ?? { estimate: defaultFactWorkEstimator }
    const estimate = await this.readPort(() =>
      factWorkPort.estimate({
        factCardinality: facts.statistics.factCardinality,
        extraMetricCount: demand.work.extraMetricCount + periodWork + comparisonPeriodWork,
        bucketWork,
        dimensionCount: demand.work.dimensionCount,
        filterCount: demand.work.filterCount,
        distinctCountOperations: demand.work.distinctCountOperations,
        budget: demand.work.budget,
      }),
    )
    assertAdmittedFactWork(estimate, demand.work.budget)

    return {
      periods: preparation.periods,
      evaluation: {
        current: preparation.evaluation.current,
        comparison: preparation.evaluation.comparison,
        interval: preparation.evaluation.interval,
      },
      projectionGeneration: facts.projection.checkpoint.projectionGeneration,
      freshness: {
        current: resolveFreshness(
          preparation.evaluation.current.period,
          facts.projection,
          preparation.evaluation.current.sequence,
        ),
        comparison:
          preparation.periods.comparison === null
            ? null
            : resolveFreshness(
                preparation.evaluation.comparison?.period ?? preparation.periods.comparison,
                facts.projection,
                preparation.evaluation.comparison?.sequence,
              ),
      },
      factWork: estimate,
    }
  }

  async #readFacts(
    input: {
      readonly siteId: ReportAdmissionPreparationInput['siteId']
      readonly coverage: ReportAdmissionDemand['coverage']
    },
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

function resolveEvaluationPeriods(input: {
  readonly metadata: Parameters<typeof resolveReportPeriods>[0]['metadata']
  readonly periods: ResolvedPeriods
  readonly periodization: ReportAdmissionInput['periodization']
}): ReportEvaluationPeriods & {
  readonly coveragePeriods: ResolvedPeriods
} {
  const currentPeriodization = input.periodization?.current
  const comparisonPeriodization = input.periodization?.comparison
  const currentSequence =
    currentPeriodization === undefined
      ? null
      : resolvePeriodSequence({
          key: 'current',
          metadata: input.metadata,
          dates: input.periods.current.dates,
          periodization: currentPeriodization,
        })
  const comparisonSequence =
    comparisonPeriodization === undefined || input.periods.comparison === null
      ? null
      : resolvePeriodSequence({
          key: 'comparison',
          metadata: input.metadata,
          dates: input.periods.comparison.dates,
          periodization: comparisonPeriodization,
        })
  const current = {
    period: input.periods.current,
    sequence: currentSequence,
  }
  const comparison =
    input.periods.comparison === null
      ? null
      : { period: input.periods.comparison, sequence: comparisonSequence }
  const intervals = [
    input.periods.current.interval,
    ...(input.periods.comparison === null ? [] : [input.periods.comparison.interval]),
    ...(currentSequence?.map((period) => period.interval) ?? []),
    ...(comparisonSequence?.map((period) => period.interval) ?? []),
  ]
  const interval = {
    start: createInstantMs(Math.min(...intervals.map((value) => value.start))),
    endExclusive: createInstantMs(Math.max(...intervals.map((value) => value.endExclusive))),
  }
  const coveragePeriods: ResolvedPeriods = {
    current: { ...input.periods.current, interval },
    comparison: null,
  }
  return { current, comparison, interval, coveragePeriods }
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
    projection.checkpoint.projectedFactCardinality === null ||
    statistics.factCardinality !== projection.checkpoint.projectedFactCardinality ||
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
  sequence: readonly ResolvedPeriod[] | null = null,
): FreshnessEvidence {
  const coveredThrough = projection.checkpoint.occurrenceCoveredThrough
  const evaluationEndExclusive =
    sequence?.at(-1)?.interval.endExclusive ?? period.interval.endExclusive
  return {
    status:
      coveredThrough !== null && coveredThrough >= evaluationEndExclusive ? 'current' : 'stale',
    projectedAcceptanceSequence: projection.checkpoint.projectedAcceptanceSequence,
    occurrenceTimeCoverageThrough: coveredThrough,
  }
}
