import { api, authenticatedApi } from '../../orpc.ts'
import { toOrpcReportingError } from './errors.ts'
import type { TrafficReportService } from './service.ts'

const trafficReportApi = api.trafficReport
const authenticatedTrafficReportApi = authenticatedApi.trafficReport

export function trafficReportRouter(service: TrafficReportService) {
  return trafficReportApi.router({
    getTrafficOverview: authenticatedTrafficReportApi.getTrafficOverview.handler(
      async ({ input, context }) => {
        try {
          return await service.getOverview(input, context.user)
        } catch (error) {
          throw toOrpcReportingError(error)
        }
      },
    ),
    getTrafficBreakdowns: authenticatedTrafficReportApi.getTrafficBreakdowns.handler(
      async ({ input, context }) => {
        try {
          return await service.getBreakdowns(input, context.user)
        } catch (error) {
          throw toOrpcReportingError(error)
        }
      },
    ),
  })
}
