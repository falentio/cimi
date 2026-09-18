import { describe, expect, test } from 'vitest'
import { createSerializedOperationQueue } from './operation-queue.ts'

describe('createSerializedOperationQueue', () => {
  test('runs later operations after a rejected operation', async () => {
    const queue = createSerializedOperationQueue()
    const events: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })

    const first = queue.run(async () => {
      events.push('first:start')
      await firstReady
      events.push('first:fail')
      throw new Error('first failed')
    })
    const second = queue.run(async () => {
      events.push('second:start')
      return 'second result'
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])
    releaseFirst?.()

    await expect(first).rejects.toThrow('first failed')
    await expect(second).resolves.toBe('second result')
    expect(events).toEqual(['first:start', 'first:fail', 'second:start'])
  })

  test('keeps concurrent operations in invocation order', async () => {
    const queue = createSerializedOperationQueue()
    const events: string[] = []

    const results = await Promise.all([
      queue.run(async () => {
        events.push('first')
        return 1
      }),
      queue.run(async () => {
        events.push('second')
        return 2
      }),
      queue.run(async () => {
        events.push('third')
        return 3
      }),
    ])

    expect(results).toEqual([1, 2, 3])
    expect(events).toEqual(['first', 'second', 'third'])
  })
})
