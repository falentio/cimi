import type { IngestionSite, SiteIngestionPort } from '@cimi/guard'
import type { SiteRepository } from './repository.ts'

export interface CreateSiteIngestionPortDependencies {
  readonly repository: SiteRepository
}

export function createSiteIngestionPort({
  repository,
}: CreateSiteIngestionPortDependencies): SiteIngestionPort {
  return {
    async findActiveByIngestionIdentifier(
      ingestionIdentifier: string,
    ): Promise<IngestionSite | undefined> {
      const site = await repository.findByIngestionIdentifier(ingestionIdentifier)

      if (site === undefined) return undefined

      return {
        id: site.id,
        hostname: site.hostname,
        reportingTimezone: site.reportingTimezone,
      }
    },
  }
}
