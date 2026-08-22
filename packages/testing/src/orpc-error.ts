import { ORPCError } from '@orpc/server'
import { expect, vi } from 'vitest'

type MessageExpectation = string | RegExp | Array<string | RegExp>

function assertMessageMatches(actual: string, expected: MessageExpectation): void {
  if (typeof expected === 'string') {
    expect(actual).toContain(expected)
    return
  }
  if (expected instanceof RegExp) {
    expect(actual).toMatch(expected)
    return
  }
  for (const entry of expected) {
    if (typeof entry === 'string') expect(actual).toContain(entry)
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
    const orpcError = error as ORPCError<string, unknown>
    expect(orpcError.code).toBe(code)
    expect(orpcError.status).toBe(status)
    if (message !== undefined) {
      assertMessageMatches(orpcError.message, message)
    }
  },
)

export const expectSyncORPCError = vi.defineHelper(
  (call: () => unknown, code: string, status: number, message?: MessageExpectation) =>
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
    const body = (await response.json()) as ORPCErrorResponseBody
    expect(body.code).toBe(code)
    expect(body.status).toBe(status)
    if (message !== undefined) {
      assertMessageMatches(body.message as string, message)
    }
  },
)
