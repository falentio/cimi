import { api, authenticatedApi } from '../../orpc.ts'
import type { FunnelService } from './service.ts'

export function funnelRouter(service: FunnelService) {
  return api.funnel.router({
    listFunnels: authenticatedApi.funnel.listFunnels.handler(({ input, context }) =>
      service.list(input, context.user),
    ),
    getFunnel: authenticatedApi.funnel.getFunnel.handler(({ input, context }) =>
      service.get(input, context.user),
    ),
    getFunnelReport: authenticatedApi.funnel.getFunnelReport.handler(({ input, context }) =>
      service.getReport(input, context.user),
    ),
    createFunnel: authenticatedApi.funnel.createFunnel.handler(({ input, context }) =>
      service.create(input, context.user),
    ),
    updateFunnel: authenticatedApi.funnel.updateFunnel.handler(({ input, context }) =>
      service.update(input, context.user),
    ),
    archiveFunnel: authenticatedApi.funnel.archiveFunnel.handler(({ input, context }) =>
      service.archive(input, context.user),
    ),
  })
}
