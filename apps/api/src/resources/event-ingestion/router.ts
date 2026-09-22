import { api } from '../../orpc.ts'
import type { ApiContext } from '../../orpc.ts'
import { extractRequestContext, type RequestContextOptions } from '../../request-context.ts'
import type { EventIngestionService, IngestionRequestContext } from './service.ts'

export type EventIngestionRouterOptions = RequestContextOptions

export function eventIngestionRouter(
  service: EventIngestionService,
  options: EventIngestionRouterOptions = {},
) {
  return api.eventIngestion.router({
    collectEvent: api.eventIngestion.collectEvent.handler(({ input, context }) =>
      service.collectEvent(input, ingestionRequestContext(context, options)),
    ),
    collectEvents: api.eventIngestion.collectEvents.handler(({ input, context }) =>
      service.collectEvents(input, ingestionRequestContext(context, options)),
    ),
  })
}

function ingestionRequestContext(
  context: Pick<ApiContext, 'headers' | 'sourceIp'>,
  options: EventIngestionRouterOptions,
): IngestionRequestContext {
  const extracted = extractRequestContext(context.headers, options)
  return context.sourceIp === undefined ? extracted : { ...extracted, sourceIp: context.sourceIp }
}
