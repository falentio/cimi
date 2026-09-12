import { api } from '../../orpc.ts'
import { extractRequestContext, type RequestContextOptions } from '../../request-context.ts'
import type { EventIngestionService } from './service.ts'

export type EventIngestionRouterOptions = RequestContextOptions

export function eventIngestionRouter(
  service: EventIngestionService,
  options: EventIngestionRouterOptions = {},
) {
  return api.eventIngestion.router({
    collectEvent: api.eventIngestion.collectEvent.handler(({ input, context }) =>
      service.collectEvent(input, extractRequestContext(context.headers, options)),
    ),
    collectEvents: api.eventIngestion.collectEvents.handler(({ input, context }) =>
      service.collectEvents(input, extractRequestContext(context.headers, options)),
    ),
  })
}
