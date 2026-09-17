import { adminApi, api } from '../../orpc.ts'
import { trustedSourceIp } from '../../request-context.ts'
import type { PublicDashboardService } from './service.ts'

export function publicDashboardRouter(
  service: PublicDashboardService,
  options: { readonly trustProxyHeaders?: boolean | undefined } = {},
) {
  return api.publicDashboard.router({
    getPublicDashboardConfig: adminApi.publicDashboard.getPublicDashboardConfig.handler(
      ({ input, context }) => service.getConfig(input, context.user),
    ),
    enablePublicDashboard: adminApi.publicDashboard.enablePublicDashboard.handler(
      ({ input, context }) => service.enable(input, context.user),
    ),
    disablePublicDashboard: adminApi.publicDashboard.disablePublicDashboard.handler(
      ({ input, context }) => service.disable(input, context.user),
    ),
    rotatePublicDashboardIdentifier:
      adminApi.publicDashboard.rotatePublicDashboardIdentifier.handler(({ input, context }) =>
        service.rotate(input, context.user),
      ),
    queryPublicDashboard: api.publicDashboard.queryPublicDashboard.handler(({ input, context }) =>
      service.query(
        input,
        options.trustProxyHeaders === true
          ? (trustedSourceIp(context.headers) ?? 'unknown')
          : 'unknown',
      ),
    ),
  })
}
