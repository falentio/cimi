import { describe, expect, test } from 'vitest'
import { createApiServerShutdown } from './api-server-shutdown.ts'

describe('createApiServerShutdown', () => {
  test('attempts later resources and retries only the failed phase', async () => {
    const events: string[] = []
    let compositionAttempts = 0
    const shutdown = createApiServerShutdown({
      closeComposition: async () => {
        events.push('composition')
        compositionAttempts += 1
        if (compositionAttempts === 1) throw new Error('composition failed')
      },
      closeAnalytics: async () => {
        events.push('analytics')
      },
      closeControlDb: () => {
        events.push('control database')
      },
    })

    await expect(shutdown.close()).rejects.toBeInstanceOf(AggregateError)
    expect(events).toEqual(['composition', 'analytics', 'control database'])
    await expect(shutdown.close()).resolves.toBeUndefined()
    expect(events).toEqual(['composition', 'analytics', 'control database', 'composition'])
  })
})
