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

/**
 * The trait keys a Site's effective collection policy approves for profile filters. Reporting
 * resolves it per request from the same layered policy ingestion admits against, so the report gate
 * and the ingestion gate cannot disagree about which `trait.<k>` keys are approved.
 */
export interface ReportingProfileFilterPort {
  getProfileFilterKeys(siteId: SiteId): PortResult<readonly string[]>
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

/**
 * One reader-consistent view of a resolved report window's evidence.
 *
 * `admit` requires `statistics.asOfAcceptanceSequence` to equal the checkpoint's sequence. Read
 * through separate projection and statistics ports, the two can be taken at different instants
 * and disagree without either port breaking its own contract. This port makes the evidence one
 * read the adapter performs under a single snapshot, and hides the store split, the column
 * renames, and the retention null semantics behind one method.
 */
export interface ReportingEvidenceRequest {
  readonly siteId: SiteId
  readonly periods: ResolvedPeriods
  readonly coverage: readonly CoverageDependency[]
}

export interface ReportingEvidence {
  readonly projection: ProjectionEvidence
  readonly retention: RetentionCoverage
  readonly statistics: AlignedStatistics | undefined
}

export interface ReportingEvidencePort {
  read(request: ReportingEvidenceRequest): PortResult<ReportingEvidence>
}

interface ReportingAdmissionCommon {
  readonly metadata: ReportingMetadataPort
  readonly analyticsReadiness: AnalyticsReadinessPort
  readonly factWork?: FactWorkPort
}

/**
 * Either one consistent evidence read for stores with a transactional boundary, or the three
 * narrow ports for callers reading from independent sources. The union keeps a half-wired
 * dependency object unrepresentable.
 */
export type ReportingAdmissionDependencies = ReportingAdmissionCommon &
  (
    | { readonly evidence: ReportingEvidencePort }
    | {
        readonly projection: ReportingProjectionPort
        readonly statistics: ReportingStatisticsPort
        readonly retention: ReportingRetentionPort
      }
  )
