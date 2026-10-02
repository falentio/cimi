export function isStringValue<T>(value: T): value is T & string {
  return typeof value === 'string'
}

export function isNumberValue<T>(value: T): value is T & number {
  return typeof value === 'number'
}

export function isBooleanValue<T>(value: T): value is T & boolean {
  return typeof value === 'boolean'
}

export function isBigintValue<T>(value: T): value is T & bigint {
  return typeof value === 'bigint'
}

export function isFunctionValue<T>(value: T): value is T & Function {
  return typeof value === 'function'
}
