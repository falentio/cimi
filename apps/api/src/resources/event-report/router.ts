import { api, authenticatedApi } from '../../orpc.ts'
import type { EventReportService } from './service.ts'

const eventReportApi = api.eventReport
const authenticatedEventReportApi = authenticatedApi.eventReport

export function eventReportRouter(service: EventReportService) {
  return eventReportApi.router({
    getEventOverview: authenticatedEventReportApi.getEventOverview.handler(({ input, context }) =>
      service.getOverview(input, context.user),
    ),
    getEventTimeseries: authenticatedEventReportApi.getEventTimeseries.handler(
      ({ input, context }) => service.getTimeseries(input, context.user),
    ),
    listEvents: authenticatedEventReportApi.listEvents.handler(({ input, context }) =>
      service.listEvents(input, context.user),
    ),
    getEventBreakdowns: authenticatedEventReportApi.getEventBreakdowns.handler(
      ({ input, context }) => service.getBreakdowns(input, context.user),
    ),
  })
}
