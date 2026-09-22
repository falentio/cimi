import { ERROR_CATALOG } from '@cimi/contract'
import { isRecord } from '@cimi/utils'

export async function addPublicRateLimitHeaders(response: Response): Promise<Response> {
  if (response.status !== ERROR_CATALOG.TOO_MANY_REQUESTS.status) return response
  try {
    const body: unknown = await response.clone().json()
    if (!isRecord(body) || !isRecord(body['data']) || body['data']['status'] !== 429) {
      return response
    }
    const rateHeaders = body['data']['headers']
    if (!isRecord(rateHeaders)) return response
    const headers = new Headers(response.headers)
    const mappings = [
      ['retry-after', 'Retry-After'],
      ['x-ratelimit-scope', 'X-RateLimit-Scope'],
      ['x-ratelimit-limit', 'X-RateLimit-Limit'],
      ['x-ratelimit-remaining', 'X-RateLimit-Remaining'],
      ['x-ratelimit-reset', 'X-RateLimit-Reset'],
    ] as const
    for (const [source, target] of mappings) {
      const value = rateHeaders[source]
      if (typeof value === 'string') headers.set(target, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  } catch {
    return response
  }
}

export function addPublicNoIndexHeader(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', 'noindex, nofollow')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
