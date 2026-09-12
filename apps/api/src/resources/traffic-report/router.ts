import { api, authenticatedApi } from '../../orpc.ts'
import type { TrafficReportService } from './service.ts'

const trafficReportApi = api.trafficReport
const authenticatedTrafficReportApi = authenticatedApi.trafficReport

export function trafficReportRouter(service: TrafficReportService) {
  return trafficReportApi.router({
    getTrafficOverview: authenticatedTrafficReportApi.getTrafficOverview.handler(
      ({ input, context }) => service.getOverview(input, context.user),
    ),
    getTrafficBreakdowns: authenticatedTrafficReportApi.getTrafficBreakdowns.handler(
      ({ input, context }) => service.getBreakdowns(input, context.user),
    ),
  })
}
