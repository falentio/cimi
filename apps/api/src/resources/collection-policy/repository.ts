import type { PolicyLayers, PolicyResolution, PolicyTarget, PolicyValues } from './model.ts'

export interface CollectionPolicyRepository {
  loadLayers(siteId: string): Promise<PolicyLayers>
  commitRevision(
    input: CollectionPolicyRepository.CommitRevisionInput,
  ): Promise<CollectionPolicyRepository.CommitResult>
}

export declare namespace CollectionPolicyRepository {
  export interface CommitRevisionInput {
    readonly target: PolicyTarget
    readonly values: PolicyValues
    readonly revisionId: string
    readonly changedBy: string | null
    readonly now: Date
  }

  export interface CommitResult {
    readonly layers: PolicyLayers
    readonly resolution: PolicyResolution | null
  }
}
