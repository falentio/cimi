import { isLocalizableError, type LocalizableError } from './error-message'

export interface SettingsError extends LocalizableError {}

export function normalizeSettingsError(
  cause: unknown,
  fallbackMessage = 'Settings request failed',
): SettingsError {
  if (cause instanceof Error) {
    const message = cause.message || fallbackMessage

    return withDetails(cause, message)
  }

  if (isRecord(cause)) {
    const message = typeof cause.message === 'string' ? cause.message : undefined

    if (message !== undefined) return withDetails(cause, message)
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

function withDetails(cause: unknown, message: string): SettingsError {
  if (!isRecord(cause)) return { message }

  const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined
  const status = 'status' in cause && typeof cause.status === 'number' ? cause.status : undefined

  return {
    message,
    ...(code !== undefined && { code }),
    ...(status !== undefined && { status }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
