import { ORPCError } from '@orpc/server'
import { api, authenticatedApi } from '../../orpc.ts'
import type { PublicDashboardService } from './service.ts'

export function publicDashboardRouter(service: PublicDashboardService) {
  return api.publicDashboard.router({
    getPublicDashboardConfig: authenticatedApi.publicDashboard.getPublicDashboardConfig.handler(
      ({ input, context }) => service.getConfig(input, context.user),
    ),
    enablePublicDashboard: authenticatedApi.publicDashboard.enablePublicDashboard.handler(
      ({ input, context }) => service.enable(input, context.user),
    ),
    disablePublicDashboard: authenticatedApi.publicDashboard.disablePublicDashboard.handler(
      ({ input, context }) => service.disable(input, context.user),
    ),
    rotatePublicDashboardIdentifier:
      authenticatedApi.publicDashboard.rotatePublicDashboardIdentifier.handler(
        ({ input, context }) => service.rotate(input, context.user),
      ),
    queryPublicDashboard: api.publicDashboard.queryPublicDashboard.handler(({ input, context }) => {
      if (context.sourceIp === undefined) {
        throw new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
      }
      return service.query(input, context.sourceIp)
    }),
  })
}
