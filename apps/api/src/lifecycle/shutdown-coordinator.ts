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
      closePromise = attempt.catch((error: unknown) => {
        closePromise = undefined
        throw error
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
    readonly original: unknown,
  ) {
    super(`${label}: ${errorMessage(original)}`, { cause: original })
    this.name = 'ShutdownPhaseError'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
