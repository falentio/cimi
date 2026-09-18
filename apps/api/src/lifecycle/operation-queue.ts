export interface SerializedOperationQueue {
  run<T>(operation: () => T | PromiseLike<T>): Promise<T>
}

export function createSerializedOperationQueue(): SerializedOperationQueue {
  let tail = Promise.resolve()

  return {
    run<T>(operation: () => T | PromiseLike<T>): Promise<T> {
      const result = tail.then(() => operation())
      tail = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
}
