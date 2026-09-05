import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface RetentionPolicyRepository {
  commitPolicyChange(
    input: RetentionPolicyRepository.CommitPolicyChangeInput,
  ): Promise<RetentionPolicyRepository.PolicyCommit>
  refreshDueBoundaries(now: Date): Promise<void>
  recoverInterrupted(now: Date): Promise<void>
  claimNext(
    input: RetentionPolicyRepository.ClaimNextInput,
  ): Promise<RetentionPolicyRepository.CleanupWork | undefined>
  advance(input: RetentionPolicyRepository.AdvanceInput): Promise<void>
  succeed(input: RetentionPolicyRepository.TerminalInput): Promise<void>
  fail(input: RetentionPolicyRepository.FailInput): Promise<void>
  findResolved(
    input: RetentionPolicyRepository.FindResolvedInput,
  ): Promise<RetentionPolicyRepository.StoredResolution>
  saveInstallationDefault(
    input: RetentionPolicyRepository.SaveInstallationDefaultInput,
  ): Promise<RetentionPolicyRepository.StoredResolution>
  saveSiteOverride(
    input: RetentionPolicyRepository.SaveSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution>
  clearSiteOverride(
    input: RetentionPolicyRepository.ClearSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution>
}

export declare namespace RetentionPolicyRepository {
  export type Policy = InferOutput<typeof schema.SRetentionPolicy>
  export type CleanupStage = InferOutput<typeof schema.SCleanupStage>

  export interface CleanupSummary {
    pending: boolean
    derived: CleanupStage
    backup: CleanupStage
  }

  export type PolicyTarget = { scope: 'installation' } | { scope: 'site'; siteId: string }

  export interface SiteRetentionBoundary {
    siteId: string
    installationId: string
    policyId: string
    reportingTimezone: string
    localDay: string
    eventOccurrenceCutoffAt: Date
    rawReceiptCutoffAt: Date
    profileActivityCutoffAt: Date
    replayReceiptCutoffAt: Date | null
    effectiveAt: Date
    updatedAt: Date
  }

  export interface PolicyCommit {
    resolution: StoredResolution
    affectedBoundaries: readonly SiteRetentionBoundary[]
    queuedRunIds: readonly string[]
  }

  export type CleanupKind = 'derived' | 'backup'

  export interface CleanupCheckpoint {
    id: string
    dataClass: string
    stage: CleanupKind
    cursor: string | null
    processedThrough: Date | null
    status: 'pending' | 'running' | 'completed' | 'failed'
    updatedAt: Date
  }

  export interface CleanupWork {
    runId: string
    kind: CleanupKind
    siteId: string
    boundary: SiteRetentionBoundary
    checkpoints: readonly CleanupCheckpoint[]
  }

  export interface ClaimNextInput {
    now: Date
  }

  export interface AdvanceInput {
    runId: string
    kind: CleanupKind
    cursor: string | null
    processedThrough: Date | null
    now: Date
  }

  export interface TerminalInput {
    runId: string
    kind: CleanupKind
    now: Date
  }

  export interface FailInput extends TerminalInput {
    errorCode: 'CLEANUP_FAILED'
    errorMessage: string
  }

  export interface StoredResolution {
    installationId: string
    installationDefault: Policy
    siteOverride: Policy | null
    effectivePolicy: Policy
    cleanup: CleanupSummary
    updatedAt: string
  }

  export interface CommitPolicyChangeInput {
    target: PolicyTarget
    policy: Policy | null
    policyId: string
    changedBy: string | null
    now: Date
  }

  export interface FindResolvedInput {
    siteId: string | null
  }

  export interface SaveInstallationDefaultInput {
    id: string
    policy: Policy
    now: Date
  }

  export interface SaveSiteOverrideInput {
    id: string
    siteId: string
    policy: Policy
    now: Date
  }

  export interface ClearSiteOverrideInput {
    siteId: string
    now: Date
  }
}
