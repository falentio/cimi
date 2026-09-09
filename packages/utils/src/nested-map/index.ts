export function getNestedMapValue<T>(
  map: ReadonlyMap<string, ReadonlyMap<string, T>>,
  first: string,
  second: string,
): T | undefined {
  return map.get(first)?.get(second)
}

export function setNestedMapValue<T>(
  map: Map<string, Map<string, T>>,
  first: string,
  second: string,
  value: T,
): void {
  let nested = map.get(first)
  if (nested === undefined) {
    nested = new Map()
    map.set(first, nested)
  }
  nested.set(second, value)
}

export function nestedMapValues<T>(map: ReadonlyMap<string, ReadonlyMap<string, T>>): T[] {
  return [...map.values()].flatMap((nested) => [...nested.values()])
}
