import type { LocalizableError } from './error-message'

export interface SettingsError extends LocalizableError {}

export function normalizeSettingsError(
  value: unknown,
  fallbackMessage = 'Settings request failed',
): SettingsError {
  if (value instanceof Error) {
    const message = value.message || fallbackMessage
    const code = 'code' in value && typeof value.code === 'string' ? value.code : undefined
    return code === undefined ? { message } : { code, message }
  }

  if (isRecord(value)) {
    const message = typeof value.message === 'string' ? value.message : undefined
    const code = typeof value.code === 'string' ? value.code : undefined
    if (message !== undefined) return code === undefined ? { message } : { code, message }
  }

  return { message: fallbackMessage }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
