import { describe, expect, it } from 'vitest'

import { createSingleton } from '../index.ts'

describe('createSingleton', () => {
  it('returns the created instance', () => {
    const instance = { value: 42 }
    const get = createSingleton(() => instance)
    expect(get()).toBe(instance)
  })

  it('calls create exactly once across repeated invocations', () => {
    let calls = 0
    const get = createSingleton(() => {
      calls += 1
      return { calls }
    })
    get()
    get()
    get()
    expect(calls).toBe(1)
  })

  it('gives separate singletons separate instances', () => {
    const getA = createSingleton(() => ({ id: 'a' }))
    const getB = createSingleton(() => ({ id: 'b' }))
    const a = getA()
    const b = getB()
    expect(a).not.toBe(b)
    expect(getA()).toBe(a)
    expect(getB()).toBe(b)
  })
})
