import { describe, expect, test } from 'vitest'
import { createShutdownCoordinator } from './shutdown-coordinator.ts'

describe('createShutdownCoordinator', () => {
  test('attempts every phase and labels each failure', async () => {
    const events: string[] = []
    const coordinator = createShutdownCoordinator([
      {
        label: 'first worker',
        async close() {
          events.push('first worker')
          throw new Error('first failed')
        },
      },
      {
        label: 'second worker',
        async close() {
          events.push('second worker')
        },
      },
      {
        label: 'third worker',
        async close() {
          events.push('third worker')
          throw new Error('third failed')
        },
      },
    ])

    const failure = await coordinator.close().catch((error: unknown) => error)

    expect(events).toEqual(['first worker', 'second worker', 'third worker'])
    expect(failure).toBeInstanceOf(AggregateError)
    expect((failure as AggregateError).errors.map((error) => (error as Error).message)).toEqual([
      'first worker: first failed',
      'third worker: third failed',
    ])
  })

  test('retries failed phases and caches only a successful close', async () => {
    const attempts = new Map<string, number>()
    const events: string[] = []
    const coordinator = createShutdownCoordinator(
      ['first worker', 'second worker'].map((label) => ({
        label,
        async close() {
          events.push(label)
          const attempt = (attempts.get(label) ?? 0) + 1
          attempts.set(label, attempt)
          if (attempt === 1) throw new Error(`${label} failed`)
        },
      })),
    )

    await expect(coordinator.close()).rejects.toBeInstanceOf(AggregateError)
    await expect(coordinator.close()).resolves.toBeUndefined()
    await expect(coordinator.close()).resolves.toBeUndefined()

    expect(events).toEqual(['first worker', 'second worker', 'first worker', 'second worker'])
    expect(attempts).toEqual(
      new Map([
        ['first worker', 2],
        ['second worker', 2],
      ]),
    )
  })

  test('shares a close attempt across concurrent callers', async () => {
    let release: (() => void) | undefined
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    let attempts = 0
    const coordinator = createShutdownCoordinator([
      {
        label: 'worker',
        async close() {
          attempts += 1
          await blocked
        },
      },
    ])

    const first = coordinator.close()
    const second = coordinator.close()
    expect(first).toBe(second)
    release?.()
    await Promise.all([first, second])
    expect(attempts).toBe(1)
  })
})
