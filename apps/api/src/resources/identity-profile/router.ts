import { api, authenticatedApi } from '../../orpc.ts'
import { extractRequestContext, type RequestContextOptions } from '../../request-context.ts'
import type { IdentityProfileService } from './service.ts'

export type IdentityProfileRouterOptions = RequestContextOptions

export function identityProfileRouter(
  service: IdentityProfileService,
  options: IdentityProfileRouterOptions = {},
) {
  return api.identityProfile.router({
    listProfiles: authenticatedApi.identityProfile.listProfiles.handler(({ input, context }) =>
      service.list(input, context.user, context.headers),
    ),
    getProfile: authenticatedApi.identityProfile.getProfile.handler(({ input, context }) =>
      service.get(input, context.user, context.headers),
    ),
    getDeletionStatus: authenticatedApi.identityProfile.getDeletionStatus.handler(
      ({ input, context }) => service.getDeletionStatus(input, context.user, context.headers),
    ),
    identify: api.identityProfile.identify.handler(({ input, context }) =>
      service.identify(input, extractRequestContext(context.headers, options)),
    ),
    requestProfileDeletion: authenticatedApi.identityProfile.requestProfileDeletion.handler(
      ({ input, context }) => service.requestDeletion(input, context.user, context.headers),
    ),
  })
}
