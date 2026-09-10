import { api, authenticatedApi } from '../../orpc.ts'
import { isBotUA } from '@cimi/utils'
import { trustedSourceIp } from '../event-ingestion/router.ts'
import type { IdentityProfileRequestContext, IdentityProfileService } from './service.ts'

export interface IdentityProfileRouterOptions {
  readonly trustProxyHeaders?: boolean | undefined
  readonly countryResolver?: ((headers: Headers) => string | undefined) | undefined
}

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
      service.identify(input, requestContext(context.headers, options)),
    ),
    requestProfileDeletion: authenticatedApi.identityProfile.requestProfileDeletion.handler(
      ({ input, context }) => service.requestDeletion(input, context.user, context.headers),
    ),
  })
}

function requestContext(
  headers: Headers,
  options: IdentityProfileRouterOptions,
): IdentityProfileRequestContext {
  const sourceIp = options.trustProxyHeaders ? trustedSourceIp(headers) : undefined
  const userAgent = headers.get('user-agent')
  const country = options.countryResolver?.(headers)
  return {
    ...(sourceIp === undefined ? {} : { sourceIp }),
    ...(country === undefined ? {} : { country }),
    ...(userAgent === null ? {} : { isBot: isBotUA(userAgent) }),
  }
}
