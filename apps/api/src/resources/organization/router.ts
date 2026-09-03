import { api, authenticatedApi } from '../../orpc.ts'
import type { OrganizationService } from './service.ts'

const organizationApi = api.organization
const authenticatedOrganizationApi = authenticatedApi.organization

export function organizationRouter(service: OrganizationService) {
  return organizationApi.router({
    listOrganizations: authenticatedOrganizationApi.listOrganizations.handler(
      ({ input, context }) => service.list(input, context.user, context.headers),
    ),
    getOrganization: authenticatedOrganizationApi.getOrganization.handler(({ input, context }) =>
      service.get(input, context.user, context.headers),
    ),
    ensurePersonalOrganization: authenticatedOrganizationApi.ensurePersonalOrganization.handler(
      ({ input, context }) => service.ensurePersonal(input, context.user, context.headers),
    ),
    createOrganization: authenticatedOrganizationApi.createOrganization.handler(
      ({ input, context }) => service.create(input, context.user, context.headers),
    ),
    updateOrganization: authenticatedOrganizationApi.updateOrganization.handler(
      ({ input, context }) => service.update(input, context.user, context.headers),
    ),
    deleteOrganization: authenticatedOrganizationApi.deleteOrganization.handler(
      ({ input, context }) => service.delete(input, context.user, context.headers),
    ),
  })
}
