import { describe, expect, it } from 'vitest'
import { createDuckDbCloseController, type DuckDbCloseOperations } from '../close-progress.ts'

function createOperations(overrides: Partial<DuckDbCloseOperations> = {}) {
  const events: string[] = []
  const operations: DuckDbCloseOperations = {
    checkpoint: async () => {
      events.push('checkpoint')
    },
    closeConnection: () => {
      events.push('connection')
    },
    closeInstance: () => {
      events.push('instance')
    },
    ...overrides,
  }
  return { events, operations }
}

describe('createDuckDbCloseController', () => {
  it('retries a failed checkpoint before closing native resources', async () => {
    let attempts = 0
    const { events, operations } = createOperations({
      checkpoint: async () => {
        events.push('checkpoint')
        attempts += 1
        if (attempts === 1) throw new Error('checkpoint failed')
      },
    })
    const controller = createDuckDbCloseController({
      operations,
      schedule: (work) => work(),
    })

    await expect(controller.close()).rejects.toThrow('checkpoint failed')
    expect(events).toEqual(['checkpoint'])
    expect(controller.isOpen()).toBe(false)

    await expect(controller.close()).resolves.toBeUndefined()
    expect(events).toEqual(['checkpoint', 'checkpoint', 'connection', 'instance'])
    await expect(controller.close()).resolves.toBeUndefined()
  })

  it('retries only the native resource that failed to close', async () => {
    let attempts = 0
    const { events, operations } = createOperations({
      closeConnection: () => {
        events.push('connection')
        attempts += 1
        if (attempts === 1) throw new Error('connection close failed')
      },
    })
    const controller = createDuckDbCloseController({
      operations,
      schedule: (work) => work(),
    })

    await expect(controller.close()).rejects.toThrow('connection close failed')
    expect(events).toEqual(['checkpoint', 'connection', 'instance'])
    await expect(controller.close()).resolves.toBeUndefined()
    expect(events).toEqual(['checkpoint', 'connection', 'instance', 'connection'])
  })

  it('shares one in-flight close attempt', async () => {
    let run: (() => void) | undefined
    const { events, operations } = createOperations()
    const controller = createDuckDbCloseController({
      operations,
      schedule: <T>(work: () => Promise<T>) =>
        new Promise<T>((resolve, reject) => {
          run = () => {
            work().then(resolve, reject)
          }
        }),
    })

    const first = controller.close()
    const second = controller.close()
    expect(first).toBe(second)
    expect(events).toEqual([])
    await Promise.resolve()
    run?.()
    await Promise.all([first, second])
    expect(events).toEqual(['checkpoint', 'connection', 'instance'])
  })
})
