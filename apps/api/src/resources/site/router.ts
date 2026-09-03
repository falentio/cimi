import { api, authenticatedApi } from '../../orpc.ts'
import type { SiteService } from './service.ts'

const siteApi = api.site
const authenticatedSiteApi = authenticatedApi.site

export function siteRouter(service: SiteService) {
  return siteApi.router({
    listSites: authenticatedSiteApi.listSites.handler(({ input, context }) =>
      service.list(input, context.user, context.headers),
    ),
    getSite: authenticatedSiteApi.getSite.handler(({ input, context }) =>
      service.get(input, context.user, context.headers),
    ),
    getSiteDeletionStatus: authenticatedSiteApi.getSiteDeletionStatus.handler(
      ({ input, context }) => service.getDeletionStatus(input, context.user, context.headers),
    ),
    createSite: authenticatedSiteApi.createSite.handler(({ input, context }) =>
      service.create(input, context.user, context.headers),
    ),
    updateSiteV2: authenticatedSiteApi.updateSiteV2.handler(({ input, context }) =>
      service.update(input, context.user, context.headers),
    ),
    deleteSite: authenticatedSiteApi.deleteSite.handler(({ input, context }) =>
      service.delete(input, context.user, context.headers),
    ),
    recoverSite: authenticatedSiteApi.recoverSite.handler(({ input, context }) =>
      service.recover(input, context.user, context.headers),
    ),
    rotateIngestionIdentifier: authenticatedSiteApi.rotateIngestionIdentifier.handler(
      ({ input, context }) =>
        service.rotateIngestionIdentifier(input, context.user, context.headers),
    ),
  })
}
