import { describe, expect, it } from 'vitest'
import { ERROR_CATALOG, getErrorDefinition, toORPCErrorMap } from './errors.ts'

describe('central contract error catalog', () => {
  it('keeps a stable code, HTTP status, and safe message for every error', () => {
    for (const [code, definition] of Object.entries(ERROR_CATALOG)) {
      expect(definition.code).toBe(code)
      expect(definition.status).toBeGreaterThanOrEqual(400)
      expect(definition.message).not.toMatch(/path|sql|credential|stack/i)
    }
  })

  it('builds oRPC error maps from the central definitions', () => {
    expect(toORPCErrorMap('UNAUTHORIZED', 'NOT_FOUND')).toEqual({
      UNAUTHORIZED: {
        status: 401,
        message: 'Authentication is required.',
      },
      NOT_FOUND: {
        status: 404,
        message: 'The requested resource was not found.',
      },
    })
    expect(getErrorDefinition('SERVICE_UNAVAILABLE')).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      message: 'The service is temporarily unavailable.',
    })
  })
})
