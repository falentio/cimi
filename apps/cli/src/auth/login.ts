import { CLI_AUTH_CLIENT_ID } from '@cimi/auth'
import { parseServerOrigin, type ServerOrigin } from './origin.ts'
import {
  parseBearerToken,
  type BearerToken,
  type CredentialProfile,
  type CredentialStore,
} from './profile.ts'

export interface AuthOutput {
  write(text: string): void | boolean
}

export type AuthLoginFailure =
  | { readonly kind: 'input-cancelled' }
  | { readonly kind: 'invalid-origin'; readonly reason: string }
  | { readonly kind: 'device-code-request-failed' }
  | { readonly kind: 'device-response-invalid' }
  | { readonly kind: 'verification-url-invalid' }
  | { readonly kind: 'authorization-failed'; readonly reason: 'denied' | 'expired' | 'invalid' }
  | { readonly kind: 'network-error' }
  | { readonly kind: 'session-response-invalid' }
  | { readonly kind: 'credential-store-failed' }

export type AuthLoginResult =
  | { readonly ok: true; readonly profile: CredentialProfile }
  | { readonly ok: false; readonly failure: AuthLoginFailure }

export interface CreateAuthLoginDependencies {
  readonly fetch: typeof fetch
  readonly store: CredentialStore
  readonly openUrl: (url: string) => Promise<boolean>
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly now: () => number
}

export interface AuthLoginInput {
  readonly originInput: string
  readonly output: AuthOutput
}

interface DeviceCodeResponse {
  readonly device_code: string
  readonly user_code: string
  readonly verification_uri: string
  readonly verification_uri_complete?: string
  readonly expires_in: number
  readonly interval?: number
}

interface DeviceTokenResponse {
  readonly access_token?: string
  readonly token_type?: string
  readonly expires_in?: number
  readonly error?: string
}

interface SessionResponse {
  readonly user?: {
    readonly id?: string
    readonly name?: string
    readonly email?: string
    readonly role?: string | null
  }
  readonly session?: { readonly expiresAt?: string | number | Date }
}

export const DEVICE_CLIENT_ID = CLI_AUTH_CLIENT_ID
const AUTH_REQUEST_TIMEOUT_MS = 30_000

export function createAuthLogin(deps: CreateAuthLoginDependencies) {
  return async function login(input: AuthLoginInput): Promise<AuthLoginResult> {
    const parsedOrigin = parseServerOrigin(input.originInput)
    if (!parsedOrigin.ok) {
      return { ok: false, failure: { kind: 'invalid-origin', reason: parsedOrigin.reason } }
    }

    const { origin } = parsedOrigin
    input.output.write(`Starting authentication for ${origin.value}.\n`)

    let deviceResponse: DeviceCodeResponse
    try {
      const response = await fetchWithTimeout(deps, `${origin.value}/api/auth/device/code`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: DEVICE_CLIENT_ID,
          scope: 'openid profile email',
        }),
      })
      if (!response.ok) return { ok: false, failure: { kind: 'device-code-request-failed' } }
      const body: unknown = await response.json()
      if (!isDeviceCodeResponse(body)) {
        return { ok: false, failure: { kind: 'device-response-invalid' } }
      }
      deviceResponse = body
    } catch {
      return { ok: false, failure: { kind: 'network-error' } }
    }

    const verificationUrl = getVerificationUrl(origin, deviceResponse)
    if (verificationUrl === undefined) {
      return { ok: false, failure: { kind: 'verification-url-invalid' } }
    }

    input.output.write(`Open: ${verificationUrl}\n`)
    input.output.write(`User code: ${deviceResponse.user_code}\n`)
    if (!(await deps.openUrl(verificationUrl)))
      input.output.write(`Open this URL in a browser: ${verificationUrl}\n`)

    let interval = deviceResponse.interval ?? 5
    const expiresAt = deps.now() + deviceResponse.expires_in * 1_000
    let tokenResponse: DeviceTokenResponse
    while (deps.now() < expiresAt) {
      await deps.sleep(interval * 1_000)
      try {
        const response = await fetchWithTimeout(deps, `${origin.value}/api/auth/device/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: deviceResponse.device_code,
            client_id: DEVICE_CLIENT_ID,
          }),
        })
        const body: unknown = await response.json()
        if (!isDeviceTokenResponse(body)) {
          return { ok: false, failure: { kind: 'authorization-failed', reason: 'invalid' } }
        }
        tokenResponse = body
      } catch {
        return { ok: false, failure: { kind: 'network-error' } }
      }

      const token = parseBearerToken(tokenResponse.access_token)
      if (token !== undefined) {
        if (
          tokenResponse.token_type !== undefined &&
          tokenResponse.token_type.toLowerCase() !== 'bearer'
        ) {
          return { ok: false, failure: { kind: 'authorization-failed', reason: 'invalid' } }
        }
        return finishLogin(deps, input.output, origin, token, tokenResponse.expires_in)
      }
      if (tokenResponse.error === 'authorization_pending') continue
      if (tokenResponse.error === 'slow_down') {
        interval += 5
        continue
      }
      if (tokenResponse.error === 'access_denied') {
        return { ok: false, failure: { kind: 'authorization-failed', reason: 'denied' } }
      }
      if (tokenResponse.error === 'expired_token') {
        return { ok: false, failure: { kind: 'authorization-failed', reason: 'expired' } }
      }
      return { ok: false, failure: { kind: 'authorization-failed', reason: 'invalid' } }
    }

    return { ok: false, failure: { kind: 'authorization-failed', reason: 'expired' } }
  }
}

async function finishLogin(
  deps: CreateAuthLoginDependencies,
  output: AuthOutput,
  origin: ServerOrigin,
  accessToken: BearerToken,
  expiresIn: number | undefined,
): Promise<AuthLoginResult> {
  let sessionResponse: SessionResponse
  try {
    const response = await fetchWithTimeout(deps, `${origin.value}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) return { ok: false, failure: { kind: 'session-response-invalid' } }
    const body: unknown = await response.json()
    if (!isSessionResponse(body)) {
      return { ok: false, failure: { kind: 'session-response-invalid' } }
    }
    sessionResponse = body
  } catch {
    return { ok: false, failure: { kind: 'network-error' } }
  }

  const user = sessionResponse.user
  if (
    user === undefined ||
    typeof user['id'] !== 'string' ||
    typeof user['name'] !== 'string' ||
    typeof user['email'] !== 'string' ||
    (user['role'] !== null && typeof user['role'] !== 'string')
  ) {
    return { ok: false, failure: { kind: 'session-response-invalid' } }
  }

  const profile: CredentialProfile = {
    formatVersion: 1,
    origin,
    accessToken,
    tokenType: 'Bearer',
    expiresAt: expiresIn === undefined ? undefined : deps.now() + expiresIn * 1_000,
    user: {
      id: user['id'],
      name: user['name'],
      email: user['email'],
      role: user['role'] ?? null,
    },
    authenticatedAt: deps.now(),
  }
  try {
    await deps.store.write(profile)
  } catch {
    return { ok: false, failure: { kind: 'credential-store-failed' } }
  }

  output.write(`Authenticated to ${origin.value} as ${user['email']}.\n`)
  return { ok: true, profile }
}

function getVerificationUrl(
  origin: ServerOrigin,
  response: DeviceCodeResponse,
): string | undefined {
  const candidate = response.verification_uri_complete ?? response.verification_uri
  try {
    const url = new URL(candidate, origin.value)
    if (url.username.length > 0 || url.password.length > 0) return undefined
    return url.origin === origin.value ? url.toString() : undefined
  } catch {
    return undefined
  }
}

async function fetchWithTimeout(
  deps: CreateAuthLoginDependencies,
  input: string,
  init?: RequestInit,
): Promise<Response> {
  return deps.fetch(input, { ...init, signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS) })
}

function isDeviceCodeResponse(value: unknown): value is DeviceCodeResponse {
  return (
    isRecord(value) &&
    typeof value['device_code'] === 'string' &&
    typeof value['user_code'] === 'string' &&
    typeof value['verification_uri'] === 'string' &&
    (value['verification_uri_complete'] === undefined ||
      typeof value['verification_uri_complete'] === 'string') &&
    typeof value['expires_in'] === 'number' &&
    Number.isFinite(value['expires_in']) &&
    (value['interval'] === undefined ||
      (typeof value['interval'] === 'number' && Number.isFinite(value['interval'])))
  )
}

function isDeviceTokenResponse(value: unknown): value is DeviceTokenResponse {
  return (
    isRecord(value) &&
    (value['access_token'] === undefined || typeof value['access_token'] === 'string') &&
    (value['token_type'] === undefined || typeof value['token_type'] === 'string') &&
    (value['expires_in'] === undefined ||
      (typeof value['expires_in'] === 'number' && Number.isFinite(value['expires_in']))) &&
    (value['error'] === undefined || typeof value['error'] === 'string')
  )
}

function isSessionResponse(value: unknown): value is SessionResponse {
  return isRecord(value) && (value['user'] === undefined || isRecord(value['user']))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
