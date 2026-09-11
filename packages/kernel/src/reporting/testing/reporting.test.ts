import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { AnalyticsReadinessPort } from '../../ports.ts'
import {
  FACT_WORK_WEIGHTS,
  ReportingAdmissionError,
  ReportingAdmissionService,
  checkRetentionCoverage,
  createCalendarDate,
  createInstantMs,
  createSiteId,
  estimateFactWork,
  findRelevantProjectionGap,
  resolveReportPeriods,
  type AlignedStatistics,
  type FactWorkPort,
  type ProjectionEvidence,
  type ReportingAdmissionDependencies,
  type ReportingEvidencePort,
  type ReportingMetadataPort,
  type ReportingProjectionPort,
  type ReportingRetentionPort,
  type ReportingStatisticsPort,
  type RetentionCoverage,
  type ResolvedPeriods,
} from '../../index.ts'

const siteId = createSiteId('ste-1')
const metadata = {
  siteId,
  reportingTimezone: 'UTC',
  weekStartsOn: 'monday' as const,
}
const currentInput = {
  fromDate: createCalendarDate('2026-09-05'),
  toDate: createCalendarDate('2026-09-06'),
}

function instant(value: string): ReturnType<typeof createInstantMs> {
  return createInstantMs(Date.parse(value))
}

function periodsFor(input: {
  readonly fromDate: string
  readonly toDate: string
  readonly comparison?: { readonly fromDate: string; readonly toDate: string }
  readonly bucket?: {
    readonly granularity: 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'
    readonly maxStarts: number
  }
  readonly weekStartsOn?: 'monday' | 'sunday'
  readonly timeZone?: string
}): ResolvedPeriods {
  const current = {
    fromDate: createCalendarDate(input.fromDate),
    toDate: createCalendarDate(input.toDate),
  }
  const comparison =
    input.comparison === undefined
      ? undefined
      : {
          fromDate: createCalendarDate(input.comparison.fromDate),
          toDate: createCalendarDate(input.comparison.toDate),
        }
  const siteMetadata = {
    ...metadata,
    reportingTimezone: input.timeZone ?? metadata.reportingTimezone,
    weekStartsOn: input.weekStartsOn ?? metadata.weekStartsOn,
  }
  return resolveReportPeriods({
    metadata: siteMetadata,
    current,
    ...(comparison === undefined ? {} : { comparison }),
    ...(input.bucket === undefined ? {} : { bucket: input.bucket }),
  })
}

function completeRetention(from = instant('2025-01-01T00:00:00.000Z')): RetentionCoverage {
  return {
    eventOccurrence: { state: 'available', from },
    profileActivity: { state: 'available', from },
    replayReceipt: { state: 'available', from },
  }
}

function projectionEvidence(
  occurrenceCoveredThrough: ReturnType<typeof createInstantMs> | null = instant(
    '2026-09-07T00:00:00.000Z',
  ),
): ProjectionEvidence {
  return {
    checkpoint: {
      projectedAcceptanceSequence: 42,
      occurrenceCoveredFrom: instant('2025-01-01T00:00:00.000Z'),
      occurrenceCoveredThrough,
    },
    openGaps: [],
  }
}

function createPorts(): {
  readonly dependencies: ReportingAdmissionDependencies
  readonly metadata: ReturnType<typeof mock<ReportingMetadataPort>>
  readonly projection: ReturnType<typeof mock<ReportingProjectionPort>>
  readonly statistics: ReturnType<typeof mock<ReportingStatisticsPort>>
  readonly retention: ReturnType<typeof mock<ReportingRetentionPort>>
  readonly readiness: ReturnType<typeof mock<AnalyticsReadinessPort>>
  readonly factWork: ReturnType<typeof mock<FactWorkPort>>
} {
  const metadataPort = mock<ReportingMetadataPort>()
  const projectionPort = mock<ReportingProjectionPort>()
  const statisticsPort = mock<ReportingStatisticsPort>()
  const retentionPort = mock<ReportingRetentionPort>()
  const readinessPort = mock<AnalyticsReadinessPort>()
  const factWorkPort = mock<FactWorkPort>()

  metadataPort.getActive.mockReturnValue(metadata)
  readinessPort.getHealth.mockReturnValue({ controlStore: 'ready', analyticsStore: 'ready' })
  projectionPort.read.mockReturnValue(projectionEvidence())
  statisticsPort.read.mockReturnValue({
    state: 'aligned',
    asOfAcceptanceSequence: 42,
    factCardinality: 100,
  })
  retentionPort.read.mockReturnValue(completeRetention())
  factWorkPort.estimate.mockReturnValue({
    units: 100,
    budget: 1_000,
    components: {
      baseFacts: 100,
      extraMetrics: 0,
      bucketWork: 0,
      dimensions: 0,
      filters: 0,
      distinctCounts: 0,
    },
  })

  return {
    dependencies: {
      metadata: metadataPort,
      projection: projectionPort,
      statistics: statisticsPort,
      retention: retentionPort,
      analyticsReadiness: readinessPort,
      factWork: factWorkPort,
    },
    metadata: metadataPort,
    projection: projectionPort,
    statistics: statisticsPort,
    retention: retentionPort,
    readiness: readinessPort,
    factWork: factWorkPort,
  }
}

function admissionInput(
  overrides: {
    readonly comparison?: { readonly fromDate: string; readonly toDate: string }
    readonly coverage?: readonly ('event-occurrence' | 'profile-activity' | 'replay-receipt')[]
    readonly budget?: number
  } = {},
) {
  const comparison =
    overrides.comparison === undefined
      ? undefined
      : {
          fromDate: createCalendarDate(overrides.comparison.fromDate),
          toDate: createCalendarDate(overrides.comparison.toDate),
        }
  return {
    siteId,
    current: currentInput,
    ...(comparison === undefined ? {} : { comparison }),
    coverage: overrides.coverage ?? ['event-occurrence'],
    work: {
      extraMetricCount: 0,
      dimensionCount: 0,
      filterCount: 0,
      distinctCountOperations: 0,
      budget: overrides.budget ?? 1_000,
    },
  } as const
}

async function expectAdmissionError(
  operation: () => Promise<unknown>,
  code: ReportingAdmissionError['code'],
): Promise<ReportingAdmissionError> {
  try {
    await operation()
  } catch (error) {
    if (!(error instanceof ReportingAdmissionError)) throw error
    expect(error.code).toBe(code)
    return error
  }
  throw new Error(`Expected ${code}`)
}

describe('reporting period resolution', () => {
  it('resolves inclusive UTC dates to a half-open interval', () => {
    const periods = periodsFor({ fromDate: '2026-09-05', toDate: '2026-09-06' })

    expect(periods.current.interval).toEqual({
      start: instant('2026-09-05T00:00:00.000Z'),
      endExclusive: instant('2026-09-07T00:00:00.000Z'),
    })
    expect(periods.current.calendarDays).toBe(2)
  })

  it('resolves a spring-forward day without a fixed 24-hour end', () => {
    const periods = periodsFor({
      fromDate: '2026-03-08',
      toDate: '2026-03-08',
      timeZone: 'America/New_York',
      bucket: { granularity: 'hour', maxStarts: 24 },
    })

    expect(periods.current.interval.endExclusive - periods.current.interval.start).toBe(
      23 * 60 * 60 * 1000,
    )
    expect(periods.current.bucketStarts).toHaveLength(23)
    expect(periods.current.bucketStarts?.map((bucket) => bucket.localLabel)).not.toContain(
      '2026-03-08T02:00:00',
    )
  })

  it('keeps both fall-back hourly instants', () => {
    const periods = periodsFor({
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      timeZone: 'America/New_York',
      bucket: { granularity: 'hour', maxStarts: 25 },
    })
    const repeated = periods.current.bucketStarts?.filter((bucket) =>
      bucket.localLabel.endsWith('T01:00:00'),
    )

    expect(periods.current.bucketStarts).toHaveLength(25)
    expect(repeated?.map((bucket) => bucket.at)).toEqual([
      instant('2026-11-01T05:00:00.000Z'),
      instant('2026-11-01T06:00:00.000Z'),
    ])
  })

  it('aligns weekly starts to the Site week-start setting', () => {
    const monday = periodsFor({
      fromDate: '2026-09-07',
      toDate: '2026-09-13',
      weekStartsOn: 'monday',
      bucket: { granularity: 'week', maxStarts: 1 },
    })
    const sunday = periodsFor({
      fromDate: '2026-09-06',
      toDate: '2026-09-12',
      weekStartsOn: 'sunday',
      bucket: { granularity: 'week', maxStarts: 1 },
    })

    expect(monday.current.bucketStarts?.[0]?.at).toBe(instant('2026-09-07T00:00:00.000Z'))
    expect(sunday.current.bucketStarts?.[0]?.at).toBe(instant('2026-09-06T00:00:00.000Z'))
  })

  it('keeps adjacent equal-length comparisons separate', () => {
    const periods = periodsFor({
      fromDate: '2026-09-08',
      toDate: '2026-09-09',
      comparison: { fromDate: '2026-09-06', toDate: '2026-09-07' },
    })

    expect(periods.comparison?.key).toBe('comparison')
    expect(periods.current.interval.start).toBe(instant('2026-09-08T00:00:00.000Z'))
    expect(periods.comparison?.interval.start).toBe(instant('2026-09-06T00:00:00.000Z'))
  })

  it('rejects non-adjacent or unequal comparisons', () => {
    expect(() =>
      periodsFor({
        fromDate: '2026-09-08',
        toDate: '2026-09-09',
        comparison: { fromDate: '2026-09-05', toDate: '2026-09-06' },
      }),
    ).toThrowError(ReportingAdmissionError)
    expect(() =>
      periodsFor({
        fromDate: '2026-09-08',
        toDate: '2026-09-09',
        comparison: { fromDate: '2026-09-07', toDate: '2026-09-07' },
      }),
    ).toThrowError(ReportingAdmissionError)
  })

  it('rejects an over-limit bucket count instead of clamping it', () => {
    expect(() =>
      periodsFor({
        fromDate: '2026-09-05',
        toDate: '2026-09-06',
        bucket: { granularity: 'hour', maxStarts: 47 },
      }),
    ).toThrowError(ReportingAdmissionError)
  })
})

describe('reporting gap and retention policy', () => {
  it('uses half-open overlap semantics at both gap endpoints', () => {
    const periods = periodsFor({ fromDate: '2026-09-05', toDate: '2026-09-06' })
    const before = {
      id: 'before',
      unbounded: false,
      occurrenceFrom: instant('2026-09-01T00:00:00.000Z'),
      occurrenceTo: periods.current.interval.start,
    }
    const after = {
      id: 'after',
      unbounded: false,
      occurrenceFrom: periods.current.interval.endExclusive,
      occurrenceTo: instant('2026-09-10T00:00:00.000Z'),
    }
    const inside = {
      id: 'inside',
      unbounded: false,
      occurrenceFrom: instant('2026-09-06T00:00:00.000Z'),
      occurrenceTo: instant('2026-09-08T00:00:00.000Z'),
    }

    expect(findRelevantProjectionGap([before], periods)).toBeUndefined()
    expect(findRelevantProjectionGap([after], periods)).toBeUndefined()
    expect(findRelevantProjectionGap([inside], periods)?.id).toBe('inside')
  })

  it('blocks unbounded and malformed gaps', () => {
    const periods = periodsFor({ fromDate: '2026-09-05', toDate: '2026-09-06' })
    expect(
      findRelevantProjectionGap(
        [{ id: 'unbounded', unbounded: true, occurrenceFrom: null, occurrenceTo: null }],
        periods,
      )?.id,
    ).toBe('unbounded')
    expect(
      findRelevantProjectionGap(
        [{ id: 'malformed', unbounded: false, occurrenceFrom: null, occurrenceTo: null }],
        periods,
      )?.id,
    ).toBe('malformed')
  })

  it('requires every requested retention dependency to cover both periods', () => {
    const periods = periodsFor({
      fromDate: '2026-09-08',
      toDate: '2026-09-09',
      comparison: { fromDate: '2026-09-06', toDate: '2026-09-07' },
    })

    expect(() =>
      checkRetentionCoverage({
        coverage: { ...completeRetention(), profileActivity: { state: 'disabled' } },
        required: ['event-occurrence', 'profile-activity'],
        periods,
      }),
    ).toThrowError(ReportingAdmissionError)
    expect(() =>
      checkRetentionCoverage({
        coverage: { ...completeRetention(), replayReceipt: { state: 'unknown' } },
        required: ['replay-receipt'],
        periods,
      }),
    ).toThrowError(ReportingAdmissionError)
  })
})

describe('Fact-Work estimation', () => {
  it('uses the exact generic weights and admits the exact budget', () => {
    const estimate = estimateFactWork({
      factCardinality: 100,
      extraMetricCount: 4,
      bucketWork: 10,
      dimensionCount: 2,
      filterCount: 3,
      distinctCountOperations: 5,
      budget: 108.75,
    })

    expect(FACT_WORK_WEIGHTS).toEqual({
      baseFacts: 1,
      extraMetrics: 0.25,
      bucketWork: 0.1,
      dimensions: 0.5,
      filters: 0.25,
      distinctCounts: 1,
    })
    expect(estimate?.units).toBe(108.75)
    expect(estimate?.budget).toBe(108.75)
  })

  it('fails closed for non-finite demand', () => {
    expect(
      estimateFactWork({
        factCardinality: Number.NaN,
        extraMetricCount: 0,
        bucketWork: 0,
        dimensionCount: 0,
        filterCount: 0,
        distinctCountOperations: 0,
        budget: 1,
      }),
    ).toBeUndefined()
  })
})

describe('ReportingAdmissionService', () => {
  it('checks readiness before query preflight and hides provider details', async () => {
    const ports = createPorts()
    ports.readiness.getHealth.mockRejectedValue(new Error('database password leaked'))

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'SERVICE_UNAVAILABLE',
    )

    expect(error.message).not.toContain('database password leaked')
    expect(ports.projection.read).not.toHaveBeenCalled()
    expect(ports.statistics.read).not.toHaveBeenCalled()
  })

  it('fails closed when the control store is not ready', async () => {
    const ports = createPorts()
    ports.readiness.getHealth.mockReturnValue({
      controlStore: 'degraded',
      analyticsStore: 'ready',
    })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'SERVICE_UNAVAILABLE',
    )

    expect(ports.metadata.getActive).not.toHaveBeenCalled()
  })

  it('rejects a missing site metadata with NOT_FOUND and short-circuits every later port', async () => {
    const ports = createPorts()
    ports.metadata.getActive.mockReturnValue(undefined)

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'NOT_FOUND',
    )

    expect(error.reason).toBe('metadata-missing')
    expect(ports.projection.read).not.toHaveBeenCalled()
    expect(ports.statistics.read).not.toHaveBeenCalled()
    expect(ports.retention.read).not.toHaveBeenCalled()
    expect(ports.factWork.estimate).not.toHaveBeenCalled()
  })

  it('short-circuits stale statistics before gaps, retention, and Fact-Work', async () => {
    const ports = createPorts()
    ports.statistics.read.mockReturnValue({
      state: 'stale',
      asOfAcceptanceSequence: 41,
      factCardinality: 100,
    })

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(error.message).not.toContain('provider')
    expect(ports.retention.read).not.toHaveBeenCalled()
    expect(ports.factWork.estimate).not.toHaveBeenCalled()
  })

  it('short-circuits a relevant gap before retention and Fact-Work', async () => {
    const ports = createPorts()
    ports.projection.read.mockReturnValue({
      ...projectionEvidence(),
      openGaps: [
        {
          id: 'gap-1',
          unbounded: false,
          occurrenceFrom: instant('2026-09-06T00:00:00.000Z'),
          occurrenceTo: instant('2026-09-06T12:00:00.000Z'),
        },
      ],
    })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(ports.retention.read).not.toHaveBeenCalled()
    expect(ports.factWork.estimate).not.toHaveBeenCalled()
  })

  it('short-circuits incomplete retention before Fact-Work', async () => {
    const ports = createPorts()
    ports.retention.read.mockReturnValue({
      ...completeRetention(),
      profileActivity: { state: 'unknown' },
    })

    await expectAdmissionError(
      () =>
        new ReportingAdmissionService(ports.dependencies).admit(
          admissionInput({ coverage: ['event-occurrence', 'profile-activity'] }),
        ),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(ports.factWork.estimate).not.toHaveBeenCalled()
  })

  it('returns separate current and comparison freshness evidence on success', async () => {
    const ports = createPorts()
    ports.projection.read.mockReturnValue(projectionEvidence(instant('2026-09-06T12:00:00.000Z')))
    ports.factWork.estimate.mockReturnValue({
      units: 100,
      budget: 1_000,
      components: {
        baseFacts: 100,
        extraMetrics: 0,
        bucketWork: 0,
        dimensions: 0,
        filters: 0,
        distinctCounts: 0,
      },
    })

    const ticket = await new ReportingAdmissionService(ports.dependencies).admit(
      admissionInput({
        comparison: { fromDate: '2026-09-03', toDate: '2026-09-04' },
      }),
    )

    expect(ticket.freshness.current.status).toBe('stale')
    expect(ticket.freshness.comparison?.status).toBe('current')
    expect(ticket.freshness.current).not.toHaveProperty('unavailable')
    expect(ticket.periods.comparison?.interval.start).toBe(instant('2026-09-03T00:00:00.000Z'))
  })

  it('rejects Fact-Work above the supplied budget after all earlier gates pass', async () => {
    const ports = createPorts()
    ports.factWork.estimate.mockReturnValue({
      units: 1001,
      budget: 1_000,
      components: {
        baseFacts: 1001,
        extraMetrics: 0,
        bucketWork: 0,
        dimensions: 0,
        filters: 0,
        distinctCounts: 0,
      },
    })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )
    expect(ports.retention.read).toHaveBeenCalledOnce()
    expect(ports.factWork.estimate).toHaveBeenCalledOnce()
  })

  it('rejects an undefined Fact-Work estimate as fact-work-uncertain', async () => {
    const ports = createPorts()
    ports.factWork.estimate.mockReturnValue(undefined)

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(error.reason).toBe('fact-work-uncertain')
  })

  it('rejects a non-finite Fact-Work estimate as fact-work-uncertain', async () => {
    const ports = createPorts()
    ports.factWork.estimate.mockReturnValue({
      units: Number.NaN,
      budget: 1_000,
      components: {
        baseFacts: 0,
        extraMetrics: 0,
        bucketWork: 0,
        dimensions: 0,
        filters: 0,
        distinctCounts: 0,
      },
    })

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(error.reason).toBe('fact-work-uncertain')
  })

  it('rejects a Fact-Work estimate budget that differs from the requested budget', async () => {
    const ports = createPorts()
    ports.factWork.estimate.mockReturnValue({
      units: 100,
      budget: 999,
      components: {
        baseFacts: 100,
        extraMetrics: 0,
        bucketWork: 0,
        dimensions: 0,
        filters: 0,
        distinctCounts: 0,
      },
    })

    const error = await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )

    expect(error.reason).toBe('fact-work-uncertain')
  })
})

describe('ReportingAdmissionService with one evidence read', () => {
  function createEvidenceDependencies(evidence: {
    readonly projection?: ProjectionEvidence
    readonly retention?: RetentionCoverage
    readonly statistics?: AlignedStatistics | undefined
  }) {
    const metadataPort = mock<ReportingMetadataPort>()
    const readinessPort = mock<AnalyticsReadinessPort>()
    const evidencePort = mock<ReportingEvidencePort>()
    const factWorkPort = mock<FactWorkPort>()
    metadataPort.getActive.mockReturnValue(metadata)
    readinessPort.getHealth.mockReturnValue({ controlStore: 'ready', analyticsStore: 'ready' })
    evidencePort.read.mockReturnValue({
      projection: evidence.projection ?? projectionEvidence(),
      retention: evidence.retention ?? completeRetention(),
      statistics:
        'statistics' in evidence
          ? evidence.statistics
          : { state: 'aligned', asOfAcceptanceSequence: 42, factCardinality: 100 },
    })
    factWorkPort.estimate.mockReturnValue({
      units: 100,
      budget: 1_000,
      components: {
        baseFacts: 100,
        extraMetrics: 0,
        bucketWork: 0,
        dimensions: 0,
        filters: 0,
        distinctCounts: 0,
      },
    })
    const dependencies: ReportingAdmissionDependencies = {
      metadata: metadataPort,
      analyticsReadiness: readinessPort,
      evidence: evidencePort,
      factWork: factWorkPort,
    }
    return { dependencies, evidencePort, factWorkPort }
  }

  it('reads the whole evidence in one call and admits', async () => {
    const ports = createEvidenceDependencies({})

    const ticket = await new ReportingAdmissionService(ports.dependencies).admit(admissionInput())

    expect(ports.evidencePort.read).toHaveBeenCalledOnce()
    expect(ticket.freshness.current.status).toBe('current')
    expect(ticket.factWork.units).toBe(100)
  })

  it('rejects a missing site metadata with NOT_FOUND before reading any evidence', async () => {
    const metadataPort = mock<ReportingMetadataPort>()
    const readinessPort = mock<AnalyticsReadinessPort>()
    const evidencePort = mock<ReportingEvidencePort>()
    const factWorkPort = mock<FactWorkPort>()
    metadataPort.getActive.mockReturnValue(undefined)
    readinessPort.getHealth.mockReturnValue({ controlStore: 'ready', analyticsStore: 'ready' })

    const error = await expectAdmissionError(
      () =>
        new ReportingAdmissionService({
          metadata: metadataPort,
          analyticsReadiness: readinessPort,
          evidence: evidencePort,
          factWork: factWorkPort,
        }).admit(admissionInput()),
      'NOT_FOUND',
    )

    expect(error.reason).toBe('metadata-missing')
    expect(evidencePort.read).not.toHaveBeenCalled()
    expect(factWorkPort.estimate).not.toHaveBeenCalled()
  })

  it('rejects misaligned statistics rather than trusting a torn pair', async () => {
    const ports = createEvidenceDependencies({
      statistics: { state: 'aligned', asOfAcceptanceSequence: 41, factCardinality: 100 },
    })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )
    expect(ports.factWorkPort.estimate).not.toHaveBeenCalled()
  })

  it('treats missing statistics as uncertain', async () => {
    const ports = createEvidenceDependencies({ statistics: undefined })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )
  })

  it('rejects a relevant gap before retention and Fact-Work', async () => {
    const ports = createEvidenceDependencies({
      projection: {
        ...projectionEvidence(),
        openGaps: [
          {
            id: 'gap-1',
            unbounded: false,
            occurrenceFrom: instant('2026-09-05T00:00:00.000Z'),
            occurrenceTo: instant('2026-09-05T12:00:00.000Z'),
          },
        ],
      },
    })

    await expectAdmissionError(
      () => new ReportingAdmissionService(ports.dependencies).admit(admissionInput()),
      'QUERY_LIMIT_EXCEEDED',
    )
    expect(ports.factWorkPort.estimate).not.toHaveBeenCalled()
  })

  it('rejects incomplete retention before Fact-Work', async () => {
    const ports = createEvidenceDependencies({
      retention: { ...completeRetention(), profileActivity: { state: 'unknown' } },
    })

    await expectAdmissionError(
      () =>
        new ReportingAdmissionService(ports.dependencies).admit(
          admissionInput({ coverage: ['event-occurrence', 'profile-activity'] }),
        ),
      'QUERY_LIMIT_EXCEEDED',
    )
    expect(ports.factWorkPort.estimate).not.toHaveBeenCalled()
  })
})
