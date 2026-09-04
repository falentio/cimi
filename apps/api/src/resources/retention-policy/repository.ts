import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface RetentionPolicyRepository {
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

  export interface StoredResolution {
    installationId: string
    installationDefault: Policy
    siteOverride: Policy | null
    effectivePolicy: Policy
    updatedAt: string
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
