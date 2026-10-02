export interface ShutdownPhase {
  readonly label: string
  close(): void | PromiseLike<void>
}

export interface ShutdownCoordinator {
  close(): Promise<void>
}

export function createShutdownCoordinator(phases: readonly ShutdownPhase[]): ShutdownCoordinator {
  let pending = [...phases]
  let closePromise: Promise<void> | undefined

  return {
    close() {
      if (closePromise !== undefined) return closePromise
      const attempt = closePending()
      closePromise = attempt.catch((cause: unknown) => {
        closePromise = undefined
        throw cause
      })

      return closePromise
    },
  }

  async function closePending(): Promise<void> {
    const unresolved: ShutdownPhase[] = []
    const failures: ShutdownPhaseError[] = []

    for (const phase of pending) {
      try {
        await phase.close()
      } catch (error) {
        unresolved.push(phase)
        failures.push(new ShutdownPhaseError(phase.label, error))
      }
    }

    pending = unresolved

    if (failures.length > 0) {
      throw new AggregateError(failures, 'Lifecycle shutdown failed')
    }
  }
}

class ShutdownPhaseError extends Error {
  constructor(
    readonly label: string,
    cause: unknown,
  ) {
    super(`${label}: ${errorMessage(cause)}`, { cause })
    this.name = 'ShutdownPhaseError'
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
