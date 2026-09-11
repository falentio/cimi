import { isBotUA } from '@cimi/utils'

export interface RequestContextOptions {
  readonly trustProxyHeaders?: boolean | undefined
  readonly countryResolver?: ((headers: Headers) => string | undefined) | undefined
}

export interface RequestContext {
  readonly sourceIp?: string | undefined
  readonly isBot?: boolean | undefined
  readonly userAgent?: string | undefined
  readonly country?: string | undefined
}

export function extractRequestContext(
  headers: Headers,
  options: RequestContextOptions = {},
): RequestContext {
  const sourceIp = options.trustProxyHeaders ? trustedSourceIp(headers) : undefined
  const userAgent = headers.get('user-agent') ?? undefined
  const isBot = userAgent === undefined ? undefined : isBotUA(userAgent)
  const country = options.countryResolver?.(headers)
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
