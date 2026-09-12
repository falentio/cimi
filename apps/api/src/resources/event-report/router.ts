import { api, authenticatedApi } from '../../orpc.ts'
import { toOrpcReportingError } from './errors.ts'
import type { EventReportService } from './service.ts'

const eventReportApi = api.eventReport
const authenticatedEventReportApi = authenticatedApi.eventReport

async function mapped<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    throw toOrpcReportingError(error)
  }
}

export function eventReportRouter(service: EventReportService) {
  return eventReportApi.router({
    getEventOverview: authenticatedEventReportApi.getEventOverview.handler(({ input, context }) =>
      mapped(() => service.getOverview(input, context.user)),
    ),
    getEventTimeseries: authenticatedEventReportApi.getEventTimeseries.handler(
      ({ input, context }) => mapped(() => service.getTimeseries(input, context.user)),
    ),
    listEvents: authenticatedEventReportApi.listEvents.handler(({ input, context }) =>
      mapped(() => service.listEvents(input, context.user)),
    ),
    getEventBreakdowns: authenticatedEventReportApi.getEventBreakdowns.handler(
      ({ input, context }) => mapped(() => service.getBreakdowns(input, context.user)),
    ),
  })
}
