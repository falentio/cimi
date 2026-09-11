import type { AnalyticsReadinessPort, PortResult } from '../ports.ts'
import type {
  AlignedStatistics,
  CoverageDependency,
  ProjectionEvidence,
  RetentionCoverage,
  ResolvedPeriods,
  SiteId,
  SiteReportingMetadata,
  FactWorkEstimate,
} from './types.ts'

export interface ReportingMetadataPort {
  getActive(siteId: SiteId): PortResult<SiteReportingMetadata | undefined>
}

export interface ReportingProjectionPort {
  read(siteId: SiteId): PortResult<ProjectionEvidence>
}

export interface ReportingStatisticsPort {
  read(input: {
    readonly siteId: SiteId
    readonly periods: ResolvedPeriods
    readonly coverage: readonly CoverageDependency[]
    readonly projection: ProjectionEvidence
  }): PortResult<AlignedStatistics>
}

export interface ReportingRetentionPort {
  read(input: {
    readonly siteId: SiteId
    readonly dependencies: readonly CoverageDependency[]
  }): PortResult<RetentionCoverage>
}

export interface FactWorkPort {
  estimate(input: {
    readonly factCardinality: number
    readonly extraMetricCount: number
    readonly bucketWork: number
    readonly dimensionCount: number
    readonly filterCount: number
    readonly distinctCountOperations: number
    readonly budget: number
  }): PortResult<FactWorkEstimate | undefined>
}

export interface ReportingAdmissionDependencies {
  readonly metadata: ReportingMetadataPort
  readonly projection: ReportingProjectionPort
  readonly statistics: ReportingStatisticsPort
  readonly retention: ReportingRetentionPort
  readonly analyticsReadiness: AnalyticsReadinessPort
  readonly factWork?: FactWorkPort
}
