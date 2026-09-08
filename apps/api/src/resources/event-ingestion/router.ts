import { api } from '../../orpc.ts'
import type { EventIngestionService } from './service.ts'

export function eventIngestionRouter(service: EventIngestionService) {
  return api.eventIngestion.router({
    collectEvent: api.eventIngestion.collectEvent.handler(({ input, context }) =>
      service.collectEvent(input, requestContext(context.headers)),
    ),
    collectEvents: api.eventIngestion.collectEvents.handler(({ input, context }) =>
      service.collectEvents(input, requestContext(context.headers)),
    ),
  })
}

function requestContext(headers: Headers): { sourceIp?: string; isBot?: boolean } {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const sourceIp = forwarded || headers.get('x-real-ip') || undefined
  const userAgent = headers.get('user-agent')?.toLowerCase()
  const isBot = userAgent === undefined ? undefined : /bot|crawler|spider|slurp/.test(userAgent)
  return {
    ...(sourceIp === undefined ? {} : { sourceIp }),
    ...(isBot === undefined ? {} : { isBot }),
  }
}
