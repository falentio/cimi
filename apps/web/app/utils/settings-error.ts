import { isLocalizableError, type LocalizableError } from './error-message'

export interface SettingsError extends LocalizableError {}

export function normalizeSettingsError(
  value: unknown,
  fallbackMessage = 'Settings request failed',
): SettingsError {
  if (value instanceof Error) {
    const message = value.message || fallbackMessage
    return withDetails(value, message)
  }

  if (isRecord(value)) {
    const message = typeof value.message === 'string' ? value.message : undefined
    if (message !== undefined) return withDetails(value, message)
  }

  return { message: fallbackMessage }
}

/**
 * Reports whether a normalized error can be localized at all. An error with
 * neither a code nor a status can only be shown as its raw message, which is
 * whatever the server sent.
 */
export function isLocalizableSettingsError(error: SettingsError): boolean {
  return isLocalizableError(error)
}

function withDetails(value: object, message: string): SettingsError {
  const code = 'code' in value && typeof value.code === 'string' ? value.code : undefined
  const status = 'status' in value && typeof value.status === 'number' ? value.status : undefined

  return {
    message,
    ...(code !== undefined && { code }),
    ...(status !== undefined && { status }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
