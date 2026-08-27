import { describe, expect, it } from 'vitest'

import { createSettableSingleton } from '../index.ts'

describe('createSettableSingleton', () => {
  it('throws when read before set', () => {
    const singleton = createSettableSingleton<number>()

    expect(() => singleton.get()).toThrowError('Singleton has not been set')
  })

  it('returns the value after it is set', () => {
    const singleton = createSettableSingleton<number>()

    singleton.set(0)

    expect(singleton.get()).toBe(0)
  })

  it('keeps the first value when set repeatedly', () => {
    const singleton = createSettableSingleton<string>()

    singleton.set('first')
    singleton.set('second')

    expect(singleton.get()).toBe('first')
  })

  it('replaces the value when set with force', () => {
    const singleton = createSettableSingleton<string>()

    singleton.set('first')
    singleton.set('second', { force: true })

    expect(singleton.get()).toBe('second')
  })

  it('allows undefined and null as values', () => {
    const undefinedSingleton = createSettableSingleton<string | undefined>()
    const nullSingleton = createSettableSingleton<string | null>()

    undefinedSingleton.set(undefined)
    nullSingleton.set(null)

    expect(undefinedSingleton.get()).toBeUndefined()
    expect(nullSingleton.get()).toBeNull()
  })
})
