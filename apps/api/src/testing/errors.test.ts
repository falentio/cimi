import * as v from 'valibot'
import { ERROR_CATALOG, contract } from '@cimi/contract'
import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { normalizeApiError } from '../index.ts'

describe('public API error normalizer', () => {
  it('maps known errors to the central safe definition', async () => {
    const error = await normalizeApiError(
      new ORPCError('UNAUTHORIZED', { message: 'database credentials leaked' }),
      contract.hello.create,
    )

    expect(error.toJSON()).toEqual({
      defined: true,
      code: 'UNAUTHORIZED',
      status: 401,
      message: ERROR_CATALOG.UNAUTHORIZED.message,
      data: undefined,
    })
  })

  it('maps raw errors to internal without provider details', async () => {
    const error = await normalizeApiError(
      new Error('provider credentials and connection details'),
      contract.hello.create,
    )

    expect(error.toJSON()).toEqual({
      defined: false,
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.message,
      data: undefined,
    })
  })

  it('keeps only valid data declared by the matched procedure', async () => {
    const procedure = {
      '~orpc': {
        errorMap: {
          TOO_MANY_REQUESTS: {
            status: ERROR_CATALOG.TOO_MANY_REQUESTS.status,
            message: ERROR_CATALOG.TOO_MANY_REQUESTS.message,
            data: v.strictObject({ retryAfter: v.number() }),
          },
        },
      },
    }

    const valid = await normalizeApiError(
      new ORPCError('TOO_MANY_REQUESTS', {
        data: { retryAfter: 30 },
      }),
      procedure,
    )
    const invalid = await normalizeApiError(
      new ORPCError('TOO_MANY_REQUESTS', {
        data: { providerDetail: 'secret' },
      }),
      procedure,
    )

    expect(valid.toJSON()).toMatchObject({
      defined: true,
      code: 'TOO_MANY_REQUESTS',
      status: 429,
      message: ERROR_CATALOG.TOO_MANY_REQUESTS.message,
      data: { retryAfter: 30 },
    })
    expect(invalid.toJSON()).toEqual({
      defined: false,
      code: 'TOO_MANY_REQUESTS',
      status: 429,
      message: ERROR_CATALOG.TOO_MANY_REQUESTS.message,
      data: undefined,
    })
  })
})
