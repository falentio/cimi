import { ORPCError } from '@orpc/server'
import { describe, expect, it } from 'vitest'
import { expectORPCError, expectSyncORPCError } from '../orpc-error.ts'

describe('expectORPCError', () => {
  it('passes for a matching rejected ORPCError', async () => {
    await expectORPCError(
      Promise.reject(new ORPCError('FORBIDDEN', { status: 403 })),
      'FORBIDDEN',
      403,
    )
  })

  it('throws on wrong code', async () => {
    await expect(
      expectORPCError(
        Promise.reject(new ORPCError('FORBIDDEN', { status: 403 })),
        'NOT_FOUND',
        403,
      ),
    ).rejects.toThrow()
  })

  it('throws on wrong status', async () => {
    await expect(
      expectORPCError(
        Promise.reject(new ORPCError('FORBIDDEN', { status: 403 })),
        'FORBIDDEN',
        500,
      ),
    ).rejects.toThrow()
  })

  it('asserts message as string, RegExp, and array', async () => {
    await expectORPCError(
      Promise.reject(
        new ORPCError('FORBIDDEN', { status: 403, message: 'access denied for user' }),
      ),
      'FORBIDDEN',
      403,
      'denied',
    )
    await expectORPCError(
      Promise.reject(
        new ORPCError('FORBIDDEN', { status: 403, message: 'access denied for user' }),
      ),
      'FORBIDDEN',
      403,
      /denied/,
    )
    await expectORPCError(
      Promise.reject(
        new ORPCError('FORBIDDEN', { status: 403, message: 'access denied for user' }),
      ),
      'FORBIDDEN',
      403,
      ['access', /user/],
    )
  })

  it('throws when promise does not reject', async () => {
    await expect(expectORPCError(Promise.resolve('ok'), 'FORBIDDEN', 403)).rejects.toThrow()
  })
})

describe('expectSyncORPCError', () => {
  it('passes for a throwing synchronous call', async () => {
    await expectSyncORPCError(
      () => {
        throw new ORPCError('FORBIDDEN', { status: 403 })
      },
      'FORBIDDEN',
      403,
    )
  })

  it('throws on wrong code', async () => {
    await expect(
      expectSyncORPCError(
        () => {
          throw new ORPCError('FORBIDDEN', { status: 403 })
        },
        'NOT_FOUND',
        403,
      ),
    ).rejects.toThrow()
  })
})
