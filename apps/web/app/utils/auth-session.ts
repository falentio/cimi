import type { AuthState, AuthUser } from '@/composables/useAuth'
import { isBooleanValue, isStringValue } from './type-guards'

export function authStateFromPayload(cause: unknown): AuthState {
  if (cause === null || cause === undefined) return { status: 'unauthenticated' }

  if (!isRecord(cause) || !isAuthUser(cause.user)) {
    return { status: 'error', error: { message: 'Invalid authentication session response' } }
  }

  return { status: 'authenticated', session: { user: cause.user } }
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false
  const role = value.role

  return (
    isStringValue(value.id) &&
    isStringValue(value.name) &&
    isStringValue(value.email) &&
    isBooleanValue(value.emailVerified) &&
    (value.image === null || isStringValue(value.image)) &&
    (role === undefined || role === null || isStringValue(role))
  )
}

interface AuthPayload {
  readonly user?: unknown
  readonly role?: unknown
  readonly id?: unknown
  readonly name?: unknown
  readonly email?: unknown
  readonly emailVerified?: unknown
  readonly image?: unknown
}

function isRecord<T>(value: T): value is T & AuthPayload {
  return typeof value === 'object' && value !== null
}
