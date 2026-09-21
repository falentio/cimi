export interface DuckDbCloseOperations {
  checkpoint(): Promise<void>
  closeConnection(): void
  closeInstance(): void
}

export interface DuckDbCloseController {
  isOpen(): boolean
  close(): Promise<void>
}

type CloseProgress =
  | {
      readonly kind: 'checkpoint'
      readonly connection: 'open'
      readonly instance: 'open'
    }
  | {
      readonly kind: 'resources'
      readonly checkpoint: 'complete'
      readonly connection: 'open' | 'closed'
      readonly instance: 'open' | 'closed'
    }
  | {
      readonly kind: 'closed'
      readonly checkpoint: 'complete'
      readonly connection: 'closed'
      readonly instance: 'closed'
    }

type Lifecycle = 'open' | 'closing' | 'retryable-failure' | 'closed'

export function createDuckDbCloseController(options: {
  readonly operations: DuckDbCloseOperations
  readonly schedule: <T>(work: () => Promise<T>) => Promise<T>
}): DuckDbCloseController {
  let lifecycle: Lifecycle = 'open'
  let progress: CloseProgress = {
    kind: 'checkpoint',
    connection: 'open',
    instance: 'open',
  }
  let closePromise: Promise<void> | undefined

  return {
    isOpen: () => lifecycle === 'open',
    close,
  }

  function close(): Promise<void> {
    if (progress.kind === 'closed') return Promise.resolve()
    if (closePromise !== undefined) return closePromise

    lifecycle = 'closing'
    const attempt = Promise.resolve().then(() =>
      options.schedule(async () => {
        if (progress.kind === 'checkpoint') {
          await options.operations.checkpoint()
          progress = {
            kind: 'resources',
            checkpoint: 'complete',
            connection: 'open',
            instance: 'open',
          }
        }

        if (progress.kind !== 'resources') return

        const failures: unknown[] = []
        if (progress.connection === 'open') {
          try {
            options.operations.closeConnection()
            progress = { ...progress, connection: 'closed' }
          } catch (error) {
            failures.push(error)
          }
        }
        if (progress.instance === 'open') {
          try {
            options.operations.closeInstance()
            progress = { ...progress, instance: 'closed' }
          } catch (error) {
            failures.push(error)
          }
        }
        if (failures.length === 1) throw failures[0]
        if (failures.length > 1) {
          throw new AggregateError(failures, 'DuckDB close failed')
        }
        progress = {
          kind: 'closed',
          checkpoint: 'complete',
          connection: 'closed',
          instance: 'closed',
        }
      }),
    )
    closePromise = attempt.then(
      () => {
        lifecycle = 'closed'
        closePromise = undefined
      },
      (error: unknown) => {
        lifecycle = 'retryable-failure'
        closePromise = undefined
        throw error
      },
    )
    return closePromise
  }
}
