import { describe, expect, it } from 'vitest'
import {
  apiErrorSeverity,
  createLoggingConfiguration,
  normalizeRequestId,
  toLogError,
  toLogProperties,
  withLogContext,
} from '../index.ts'

describe('toLogError', () => {
  it('preserves the useful fields from an Error', () => {
    const error = new TypeError('request failed')

    expect(toLogError(error)).toEqual({
      name: 'TypeError',
      message: 'request failed',
      stack: expect.any(String),
    })
  })

  it('converts unknown values to a safe error shape', () => {
    expect(toLogError('request failed')).toEqual({
      name: 'UnknownError',
      message: 'request failed',
    })
    expect(
      toLogError({
        toString: () => {
          throw new Error('cannot stringify')
        },
      }),
    ).toEqual({
      name: 'UnknownError',
      message: 'Unknown error',
    })
  })

  it('normalizes control characters, redacts credentials, and truncates fields', () => {
    const error = new Error(
      `{"token":"secret"} password=secret\nBasic dXNlcjpwYXNz ${'x'.repeat(600)} https://user:password@example.com/token?token=secret`,
    )
    error.stack = `Bearer secret\r${'y'.repeat(5000)}`

    const result = toLogError(error)

    expect(result.message).not.toContain('\n')
    expect(result.message).not.toContain('password=secret')
    expect(result.message).toContain('password=[REDACTED]')
    expect(result.message).not.toContain('"token":"secret"')
    expect(result.message).not.toContain('Basic dXNlcjpwYXNz')
    expect(result.message.length).toBe(512)
    expect(result.stack).toContain('Bearer [REDACTED]')
    expect(result.stack?.length).toBe(4096)
  })
})

describe('createLoggingConfiguration', () => {
  it('defines one JSON Lines console sink for the cimi root logger', () => {
    const configuration = createLoggingConfiguration()

    expect(Object.keys(configuration.sinks)).toEqual(['console'])
    expect(configuration.loggers).toEqual([
      { category: ['cimi'], lowestLevel: 'info', sinks: ['console'] },
    ])
  })

  it('uses the configured lowest level for the cimi root logger', () => {
    const configuration = createLoggingConfiguration({ lowestLevel: 'debug' })

    expect(configuration.loggers[0]).toEqual({
      category: ['cimi'],
      lowestLevel: 'debug',
      sinks: ['console'],
    })
  })
})

describe('log event contract', () => {
  it('allows only safe API fields and omits user IDs', () => {
    const event = {
      kind: 'api.http' as const,
      requestId: 'request\n1',
      method: 'post',
      path: '/api/users?token=secret',
      status: 201,
      responseTimeMs: 1.234,
      contentLength: '12',
      userAgent: 'browser\u0000',
      referrer: 'https://user:password@example.com/private?token=secret',
      userId: 'user_1',
    }

    expect(toLogProperties(event)).toEqual({
      schemaVersion: 1,
      requestId: 'request 1',
      method: 'POST',
      path: '/api/users',
      status: 201,
      responseTime: 1.23,
      contentLength: '12',
      userAgent: 'browser ',
      referrer: 'https://example.com/private',
    })
  })

  it('maps expected API outcomes below infrastructure failures', () => {
    expect(apiErrorSeverity(401)).toBe('info')
    expect(apiErrorSeverity(404)).toBe('info')
    expect(apiErrorSeverity(409)).toBe('info')
    expect(apiErrorSeverity(500)).toBe('error')
  })

  it('keeps only safe request context', () => {
    let context: Record<string, unknown> | undefined
    const requestContext = {
      requestId: 'request-1',
      method: 'GET',
      path: '/health?secret=value',
      procedure: 'health.get',
      userId: 'user_1',
    }

    withLogContext(requestContext, () => {
      context = { requestId: 'request-1' }
    })

    expect(context).toEqual({ requestId: 'request-1' })
  })

  it('omits malformed referrers instead of preserving their query', () => {
    expect(
      toLogProperties({
        kind: 'api.http',
        method: 'GET',
        path: '/health',
        status: 200,
        responseTimeMs: 1,
        referrer: 'not a URL?token=secret',
      }),
    ).not.toHaveProperty('referrer')
  })

  it('normalizes request IDs before they enter logging context', () => {
    expect(normalizeRequestId(' request\n1 ')).toBe('request 1')
    expect(normalizeRequestId('   ')).toBeNull()
  })
})
