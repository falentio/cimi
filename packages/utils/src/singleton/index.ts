const UNSET: unique symbol = Symbol('unset')

export function createSingleton<T>(create: () => T): () => T {
  let instance: { value: T } | undefined
  return () => {
    instance ??= { value: create() }
    return instance.value
  }
}

export interface SettableSingleton<T> {
  get(): T
  set(value: T, options?: SettableSingletonSetOptions): void
}

export interface SettableSingletonSetOptions {
  force?: boolean
}

export function createSettableSingleton<T>(): SettableSingleton<T> {
  let value: T | typeof UNSET = UNSET

  return {
    get() {
      if (value === UNSET) {
        throw new Error('Singleton has not been set')
      }
      return value
    },
    set(nextValue, options) {
      if (value === UNSET || options?.force === true) {
        value = nextValue
      }
    },
  }
}
