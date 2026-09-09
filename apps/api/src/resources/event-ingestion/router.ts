import { isBotUA } from '@cimi/utils'
import { api } from '../../orpc.ts'
import type { EventIngestionService } from './service.ts'

export interface EventIngestionRouterOptions {
  readonly trustProxyHeaders?: boolean | undefined
  readonly countryResolver?: ((headers: Headers) => string | undefined) | undefined
}

export function eventIngestionRouter(
  service: EventIngestionService,
  options: EventIngestionRouterOptions = {},
) {
  const trustProxyHeaders = options.trustProxyHeaders ?? false
  const countryResolver = options.countryResolver
  return api.eventIngestion.router({
    collectEvent: api.eventIngestion.collectEvent.handler(({ input, context }) =>
      service.collectEvent(
        input,
        requestContext(context.headers, trustProxyHeaders, countryResolver),
      ),
    ),
    collectEvents: api.eventIngestion.collectEvents.handler(({ input, context }) =>
      service.collectEvents(
        input,
        requestContext(context.headers, trustProxyHeaders, countryResolver),
      ),
    ),
  })
}

function requestContext(
  headers: Headers,
  trustProxyHeaders: boolean,
  countryResolver: EventIngestionRouterOptions['countryResolver'],
): { sourceIp?: string; isBot?: boolean; userAgent?: string; country?: string } {
  const sourceIp = trustProxyHeaders ? trustedSourceIp(headers) : undefined
  const userAgent = headers.get('user-agent') ?? undefined
  const isBot = userAgent === undefined ? undefined : isBotUA(userAgent)
  const country = countryResolver?.(headers)
  return {
    ...(sourceIp === undefined ? {} : { sourceIp }),
    ...(isBot === undefined ? {} : { isBot }),
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(country === undefined ? {} : { country }),
  }
}

export function trustedSourceIp(headers: Headers): string | undefined {
  const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
  if (forwarded !== undefined && forwarded !== '') return forwarded
  return headers.get('x-real-ip') ?? undefined
}
