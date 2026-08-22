export function createSingleton<T>(create: () => T): () => T {
  let instance: { value: T } | undefined
  return () => {
    instance ??= { value: create() }
    return instance.value
  }
}
