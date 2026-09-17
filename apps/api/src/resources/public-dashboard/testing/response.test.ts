import { describe, expect, it } from 'vitest'
import { addPublicNoIndexHeader, addPublicRateLimitHeaders } from '../response.ts'

describe('addPublicRateLimitHeaders', () => {
  it('copies typed adapter metadata to HTTP headers', async () => {
    const response = Response.json(
      {
        defined: true,
        code: 'TOO_MANY_REQUESTS',
        status: 429,
        data: {
          status: 429,
          headers: {
            'retry-after': '30',
            'x-ratelimit-limit': '360',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1789670460',
            'x-ratelimit-scope': 'site',
          },
        },
      },
      { status: 429 },
    )

    const enriched = await addPublicRateLimitHeaders(response)

    expect(enriched.headers.get('retry-after')).toBe('30')
    expect(enriched.headers.get('x-ratelimit-limit')).toBe('360')
    expect(enriched.headers.get('x-ratelimit-remaining')).toBe('0')
    expect(enriched.headers.get('x-ratelimit-reset')).toBe('1789670460')
    expect(enriched.headers.get('x-ratelimit-scope')).toBe('site')
  })

  it('leaves non-rate-limit responses unchanged', async () => {
    const response = Response.json({ ok: true })

    await expect(addPublicRateLimitHeaders(response)).resolves.toBe(response)
  })

  it('marks every public query response as non-indexable', () => {
    const response = Response.json({ code: 'NOT_FOUND' }, { status: 404 })

    const enriched = addPublicNoIndexHeader(response)

    expect(enriched.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  })
})
