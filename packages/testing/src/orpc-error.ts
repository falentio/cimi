import { strict as assert } from 'node:assert'
import { ORPCError } from '@orpc/server'
import { expect, vi } from 'vitest'
import { isStringValue } from '@cimi/utils'

type MessageExpectation = string | RegExp | Array<string | RegExp>

function assertMessageMatches(actual: string, expected: MessageExpectation): void {
  if (isStringValue(expected)) {
    expect(actual).toContain(expected)

    return
  }

  if (expected instanceof RegExp) {
    expect(actual).toMatch(expected)

    return
  }

  for (const entry of expected) {
    if (isStringValue(entry)) expect(actual).toContain(entry)
    else expect(actual).toMatch(entry)
  }
}

export const expectORPCError = vi.defineHelper(
  async (promise: Promise<unknown>, code: string, status: number, message?: MessageExpectation) => {
    let error: unknown
    let rejected = false

    try {
      await promise
    } catch (e) {
      error = e
      rejected = true
    }

    expect(rejected).toBe(true)
    expect(error).toBeInstanceOf(ORPCError)
    assert(error instanceof ORPCError)
    const orpcError = error
    expect(orpcError.code).toBe(code)
    expect(orpcError.status).toBe(status)

    if (message !== undefined) {
      assertMessageMatches(orpcError.message, message)
    }
  },
)

export const expectSyncORPCError = vi.defineHelper(
  (call: () => void, code: string, status: number, message?: MessageExpectation) =>
    expectORPCError(Promise.resolve().then(call), code, status, message),
)

interface ORPCErrorResponseBody {
  code?: string
  status?: number
  message?: string
}

export const expectORPCErrorResponse = vi.defineHelper(
  async (response: Response, status: number, code: string, message?: MessageExpectation) => {
    expect(response.status).toBe(status)
    const body: ORPCErrorResponseBody = await response.json()
    expect(body.code).toBe(code)
    expect(body.status).toBe(status)

    if (message !== undefined) {
      // SAFETY: a message expectation implies the body carries one; undefined fails the match below.
      assertMessageMatches(body.message as string, message)
    }
  },
)
