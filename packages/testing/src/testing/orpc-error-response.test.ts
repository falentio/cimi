import { describe, expect, it } from 'vitest'
import { expectORPCErrorResponse } from '../orpc-error.ts'

describe('expectORPCErrorResponse', () => {
  it('passes for a matching error response', async () => {
    await expectORPCErrorResponse(
      new Response(JSON.stringify({ code: 'X', status: 418, message: 'teapot' }), { status: 418 }),
      418,
      'X',
    )
  })

  it('asserts the response body message', async () => {
    await expectORPCErrorResponse(
      new Response(JSON.stringify({ code: 'X', status: 418, message: 'brew coffee failed' }), {
        status: 418,
      }),
      418,
      'X',
      ['brew', /failed/],
    )
  })

  it('throws on status mismatch', async () => {
    await expect(
      expectORPCErrorResponse(
        new Response(JSON.stringify({ code: 'X', status: 418 }), { status: 418 }),
        500,
        'X',
      ),
    ).rejects.toThrow()
  })

  it('throws on code mismatch', async () => {
    await expect(
      expectORPCErrorResponse(
        new Response(JSON.stringify({ code: 'X', status: 418 }), { status: 418 }),
        418,
        'Y',
      ),
    ).rejects.toThrow()
  })
})
