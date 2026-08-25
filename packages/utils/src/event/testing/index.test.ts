import { describe, expect, it } from 'vitest'

import { createEvent, EventEmitter } from '../index.ts'

const tick = () => Promise.resolve()

describe('EventEmitter', () => {
  it('emits typed data to listeners', async () => {
    const emitter = new EventEmitter()
    const event = createEvent<{ id: string }>('created')
    let received: { id: string } | undefined

    emitter.on(event, (data) => {
      received = data
    })
    emitter.emit(event, { id: '1' })
    await tick()

    expect(received).toEqual({ id: '1' })
  })

  it('unregisters listeners', async () => {
    const emitter = new EventEmitter()
    const event = createEvent<string>('message')
    const received: string[] = []
    const unlisten = emitter.on(event, (data) => received.push(data))

    emitter.emit(event, 'first')
    await tick()
    unlisten()
    emitter.emit(event, 'second')
    await tick()

    expect(received).toEqual(['first'])
  })

  it('reports listener errors without blocking other listeners', async () => {
    const emitter = new EventEmitter()
    const event = createEvent<string>('message')
    const errors: unknown[] = []
    const received: string[] = []

    emitter.onError((error) => errors.push(error))
    emitter.on(event, () => {
      throw new Error('boom')
    })
    emitter.on(event, (data) => received.push(data))
    emitter.emit(event, 'value')
    await tick()
    await tick()

    expect(received).toEqual(['value'])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
  })

  it('waits for asynchronous listeners to settle', async () => {
    const emitter = new EventEmitter()
    const event = createEvent<void>('work')
    let complete = false

    emitter.on(event, async () => {
      await tick()
      complete = true
    })
    emitter.emit(event, undefined)

    expect(complete).toBe(false)
    await emitter.settled()
    expect(complete).toBe(true)
  })

  it('collects and resets emitted values', async () => {
    const emitter = new EventEmitter()
    const event = createEvent<string>('item')
    const collector = emitter.createCollector(event)

    emitter.emit(event, 'a')
    emitter.emit(event, 'b')

    expect(await collector.collect()).toEqual(['a', 'b'])
    expect(await collector.collect()).toEqual([])
  })

  it('registers one waitUntil promise per emit', async () => {
    const registered: Promise<unknown>[] = []
    const emitter = new EventEmitter({
      waitUntil: (promise) => registered.push(promise),
    })
    const event = createEvent<string>('message')
    let received: string | undefined

    emitter.on(event, async (data) => {
      await tick()
      received = data
    })
    emitter.emit(event, 'hello')

    expect(registered).toHaveLength(1)
    await registered[0]
    expect(received).toBe('hello')
  })
})
