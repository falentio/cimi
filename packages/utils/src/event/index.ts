declare const _eventTypeBrandSymbol: unique symbol

export type EventName<T> = string & { [_eventTypeBrandSymbol]: T }

export type UnlistenFn = () => void

export function createEvent<T>(name: string): EventName<T> {
  return name as EventName<T>
}

export interface EventEmitterOptions {
  /**
   * Platform keep-alive hook (e.g. Cloudflare Workers `ctx.waitUntil`).
   * When provided, every `emit()` registers a promise that settles only after
   * all listeners of that event have finished, so the runtime does not
   * terminate the worker before handlers complete.
   */
  waitUntil?: (promise: Promise<unknown>) => void
}

export class EventEmitter {
  #listeners = new Map<string, Set<(data: unknown) => unknown | Promise<unknown>>>()
  #errorHandlers = new Set<(error: unknown, event: string) => void>()
  #pending = 0
  #settledResolvers: (() => void)[] = []
  #waitUntil: ((promise: Promise<unknown>) => void) | undefined

  constructor(options: EventEmitterOptions = {}) {
    this.#waitUntil = options.waitUntil
  }

  emit<T>(name: EventName<T>, data: NoInfer<T>): void {
    const handlers = this.#listeners.get(name)
    if (!handlers) return
    const work: Promise<unknown>[] = []
    for (const handler of handlers) {
      this.#pending++
      work.push(
        Promise.resolve()
          .then(() => handler(data))
          .catch((error: unknown) => {
            for (const errorHandler of this.#errorHandlers) {
              try {
                errorHandler(error, name)
              } catch {}
            }
          })
          .finally(() => {
            this.#pending--
            this.#tryResolveSettled()
          }),
      )
    }
    this.#waitUntil?.(Promise.allSettled(work))
  }

  on<T>(
    name: EventName<T>,
    callback: (data: NoInfer<T>) => unknown | Promise<unknown>,
  ): UnlistenFn {
    if (!this.#listeners.has(name)) {
      this.#listeners.set(name, new Set())
    }
    this.#listeners.get(name)!.add(callback as (data: unknown) => unknown | Promise<unknown>)
    return () => {
      const handlers = this.#listeners.get(name)
      if (!handlers) return
      handlers.delete(callback as (data: unknown) => unknown | Promise<unknown>)
      if (handlers.size === 0) {
        this.#listeners.delete(name)
      }
    }
  }

  onError(callback: (error: unknown, event: string) => void): UnlistenFn {
    this.#errorHandlers.add(callback)
    return () => {
      this.#errorHandlers.delete(callback)
    }
  }

  settled(): Promise<void> {
    if (this.#pending === 0) return Promise.resolve()
    return new Promise((resolve) => {
      this.#settledResolvers.push(resolve)
    })
  }

  createCollector<T>(name: EventName<T>): { collect(): Promise<T[]> } {
    const items: T[] = []
    this.on(name, (data: NoInfer<T>) => items.push(data))
    return {
      collect: async () => {
        await this.settled()
        const snapshot = [...items]
        items.length = 0
        return snapshot
      },
    }
  }

  #tryResolveSettled() {
    if (this.#pending === 0) {
      for (const resolve of this.#settledResolvers) {
        resolve()
      }
      this.#settledResolvers = []
    }
  }
}
