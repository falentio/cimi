import { isBotUA } from '@cimi/utils'
import { api } from '../../orpc.ts'
import type { EventIngestionService } from './service.ts'

export interface EventIngestionRouterOptions {
  readonly trustProxyHeaders?: boolean | undefined
}

export function eventIngestionRouter(
  service: EventIngestionService,
  options: EventIngestionRouterOptions = {},
) {
  const trustProxyHeaders = options.trustProxyHeaders ?? false
  return api.eventIngestion.router({
    collectEvent: api.eventIngestion.collectEvent.handler(({ input, context }) =>
      service.collectEvent(input, requestContext(context.headers, trustProxyHeaders)),
    ),
    collectEvents: api.eventIngestion.collectEvents.handler(({ input, context }) =>
      service.collectEvents(input, requestContext(context.headers, trustProxyHeaders)),
    ),
  })
}

function requestContext(
  headers: Headers,
  trustProxyHeaders: boolean,
): { sourceIp?: string; isBot?: boolean; userAgent?: string } {
  const sourceIp = trustProxyHeaders ? trustedSourceIp(headers) : undefined
  const userAgent = headers.get('user-agent') ?? undefined
  const isBot = userAgent === undefined ? undefined : isBotUA(userAgent)
  return {
    ...(sourceIp === undefined ? {} : { sourceIp }),
    ...(isBot === undefined ? {} : { isBot }),
    ...(userAgent === undefined ? {} : { userAgent }),
  }
}

export function trustedSourceIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
  if (forwarded !== undefined && forwarded !== '') return forwarded
  return headers.get('x-real-ip') ?? undefined
}
