import { computed, type ComputedRef, type Ref } from 'vue'
import type { createCimiAuthClient } from '@cimi/auth/client'

type AuthClient = ReturnType<typeof createCimiAuthClient>
type SessionResponse = Awaited<ReturnType<AuthClient['getSession']>>
type RawAuthSession = NonNullable<SessionResponse['data']>
type RawAuthUser = RawAuthSession['user']

export type AuthUser = Pick<RawAuthUser, 'id' | 'name' | 'email' | 'emailVerified' | 'image'>

export interface AuthSession {
  readonly user: AuthUser
}

export interface AuthError {
  readonly message: string
  readonly code?: string
}

export type AuthState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'authenticated'; readonly session: AuthSession }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'error'; readonly error: AuthError }

export type SignUpInput = Pick<
  Parameters<AuthClient['signUp']['email']>[0],
  'name' | 'email' | 'password'
>
export type SignInInput = Pick<Parameters<AuthClient['signIn']['email']>[0], 'email' | 'password'>

export type AuthResult =
  | { readonly ok: true; readonly session: AuthSession | null }
  | { readonly ok: false; readonly error: AuthError }

export interface AuthApi {
  readonly session: Readonly<Ref<AuthState>>
  readonly pending: Readonly<ComputedRef<boolean>>
  refreshSession(): Promise<AuthResult>
  signUp(input: SignUpInput): Promise<AuthResult>
  signIn(input: SignInInput): Promise<AuthResult>
  signOut(): Promise<AuthResult>
}

const DEFAULT_ERROR_MESSAGE = 'Authentication request failed'

export function useAuth(): AuthApi {
  const session = useState<AuthState>('auth:session', () => ({ status: 'idle' }))
  const pendingCount = useState('auth:pending-count', () => 0)
  const initialized = useState('auth:initialized', () => false)
  const pending = computed(() => pendingCount.value > 0)

  onMounted(() => {
    if (initialized.value) return
    initialized.value = true
    void refreshSession()
  })

  async function refreshSession(): Promise<AuthResult> {
    return withPending(async () => {
      session.value = { status: 'loading' }

      try {
        const result = await getAuthClient().getSession()
        if (result.error) {
          return setError(result.error)
        }

        if (result.data === null) {
          session.value = { status: 'unauthenticated' }
          return { ok: true, session: null }
        }

        const authSession = toAuthSession(result.data)
        session.value = { status: 'authenticated', session: authSession }
        return { ok: true, session: authSession }
      } catch (error: unknown) {
        return setError(error)
      }
    })
  }

  async function signUp(input: SignUpInput): Promise<AuthResult> {
    return withPending(async () => {
      try {
        const result = await getAuthClient().signUp.email(input)
        if (result.error) {
          return setError(result.error)
        }
        return refreshSession()
      } catch (error: unknown) {
        return setError(error)
      }
    })
  }

  async function signIn(input: SignInInput): Promise<AuthResult> {
    return withPending(async () => {
      try {
        const result = await getAuthClient().signIn.email(input)
        if (result.error) {
          return setError(result.error)
        }
        return refreshSession()
      } catch (error: unknown) {
        return setError(error)
      }
    })
  }

  async function signOut(): Promise<AuthResult> {
    return withPending(async () => {
      try {
        const result = await getAuthClient().signOut()
        if (result.error) {
          return { ok: false, error: normalizeAuthError(result.error) }
        }
        session.value = { status: 'unauthenticated' }
        return { ok: true, session: null }
      } catch (error: unknown) {
        return { ok: false, error: normalizeAuthError(error) }
      }
    })
  }

  function setError(error: unknown): AuthResult {
    const normalized = normalizeAuthError(error)
    session.value = { status: 'error', error: normalized }
    return { ok: false, error: normalized }
  }

  async function withPending<T>(operation: () => Promise<T>): Promise<T> {
    pendingCount.value += 1
    try {
      return await operation()
    } finally {
      pendingCount.value -= 1
    }
  }

  return { session, pending, refreshSession, signUp, signIn, signOut }
}

function getAuthClient(): AuthClient {
  if (import.meta.server) {
    throw new Error('The auth client is only available in the browser')
  }
  return useNuxtApp().$authClient
}

function toAuthSession(value: unknown): AuthSession {
  if (!isRecord(value) || !isAuthUser(value.user)) {
    throw new Error('Invalid authentication session response')
  }

  return {
    user: value.user,
  }
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    typeof value.emailVerified === 'boolean' &&
    (value.image === null || typeof value.image === 'string')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeAuthError(value: unknown): AuthError {
  if (value instanceof Error) {
    return { message: value.message || DEFAULT_ERROR_MESSAGE }
  }

  if (typeof value === 'object' && value !== null) {
    const message =
      'message' in value && typeof value.message === 'string'
        ? value.message
        : DEFAULT_ERROR_MESSAGE
    const code = 'code' in value && typeof value.code === 'string' ? value.code : undefined
    return code === undefined ? { message } : { message, code }
  }

  return { message: DEFAULT_ERROR_MESSAGE }
}
