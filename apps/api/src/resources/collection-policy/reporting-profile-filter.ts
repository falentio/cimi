import type { ReportingProfileFilterPort, SiteId } from '@cimi/kernel'
import type { CollectionPolicyService } from './service.ts'

export interface CollectionPolicyReportingProfileFilterDependencies {
  readonly collectionPolicy: CollectionPolicyService
}

export class CollectionPolicyReportingProfileFilter implements ReportingProfileFilterPort {
  private readonly collectionPolicy: CollectionPolicyService

  constructor({ collectionPolicy }: CollectionPolicyReportingProfileFilterDependencies) {
    this.collectionPolicy = collectionPolicy
  }

  async getProfileFilterKeys(siteId: SiteId): Promise<readonly string[]> {
    try {
      return await this.collectionPolicy.getEffectiveProfileFilterKeys(siteId)
    } catch {
      // No resolvable policy means no approved keys, so every trait filter fails closed.
      return []
    }
  }
}
