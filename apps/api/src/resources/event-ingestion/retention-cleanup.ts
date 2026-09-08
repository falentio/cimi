import type {
  RetentionCleanupBatchResult,
  RetentionCleanupPort,
} from '../retention-policy/cleanup.ts'
import type { RetentionPolicyRepository } from '../retention-policy/repository.ts'
import type { AcceptanceRepository } from './repository.ts'

export interface AcceptanceRetentionCleanupDependencies {
  readonly acceptance: AcceptanceRepository
}

export class AcceptanceRetentionCleanup implements RetentionCleanupPort {
  private readonly acceptance: AcceptanceRepository

  constructor({ acceptance }: AcceptanceRetentionCleanupDependencies) {
    this.acceptance = acceptance
  }

  async runDerived(input: {
    runId: string
    siteId: string
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult> {
    await this.acceptance.deleteExpired({
      siteId: input.siteId,
      receiptCutoff: input.boundary.rawReceiptCutoffAt,
    })
    return { completed: true, cursor: null, processedThrough: input.boundary.rawReceiptCutoffAt }
  }

  async runBackup(input: {
    runId: string
    siteId: string
    boundary: RetentionPolicyRepository.SiteRetentionBoundary
    checkpoints: readonly RetentionPolicyRepository.CleanupCheckpoint[]
  }): Promise<RetentionCleanupBatchResult> {
    return this.runDerived(input)
  }
}
