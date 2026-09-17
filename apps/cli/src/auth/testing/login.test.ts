import { describe, expect, test, vi } from 'vitest'
import { createAuthLogin, type AuthOutput } from '../login.ts'
import { parseBearerToken, type CredentialProfile, type CredentialStore } from '../profile.ts'

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function memoryCredentialStore() {
  const profiles: CredentialProfile[] = []
  const store: CredentialStore = {
    async read(origin) {
      return profiles.find((profile) => profile.origin.value === origin.value)
    },
    async write(profile) {
      const index = profiles.findIndex((current) => current.origin.value === profile.origin.value)
      if (index === -1) profiles.push(profile)
      else profiles[index] = profile
    },
  }
  return { profiles, store }
}

function memoryOutput(): AuthOutput & { text(): string } {
  const chunks: string[] = []
  return {
    write(chunk) {
      chunks.push(chunk)
    },
    text() {
      return chunks.join('')
    },
  }
}

describe('createAuthLogin', () => {
  test('completes device authorization and stores a profile for the selected origin', async () => {
    const { profiles, store } = memoryCredentialStore()
    const output = memoryOutput()
    let now = 1_700_000_000_000
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds
    })
    const openUrl = vi.fn(async () => false)
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({
          device_code: 'device-code',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://cimi.example.com/device',
          verification_uri_complete: 'https://cimi.example.com/device?user_code=ABCD-EFGH',
          expires_in: 900,
          interval: 5,
        }),
      )
      .mockResolvedValueOnce(response({ error: 'authorization_pending' }, 400))
      .mockResolvedValueOnce(
        response({
          access_token: 'session-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(
        response({
          user: {
            id: 'user-1',
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            role: null,
          },
          session: { expiresAt: '2026-09-17T10:00:00.000Z' },
        }),
      )
    const run = createAuthLogin({ fetch, store, openUrl, sleep, now: () => now })

    const result = await run({ originInput: 'CIMI.example.com', output })

    expect(result.ok).toBe(true)
    expect(profiles).toHaveLength(1)
    expect(profiles[0]?.origin.value).toBe('https://cimi.example.com')
    expect(profiles[0]?.accessToken).toBe(parseBearerToken('session-token'))
    expect(openUrl).toHaveBeenCalledWith('https://cimi.example.com/device?user_code=ABCD-EFGH')
    expect(sleep).toHaveBeenCalledWith(5_000)
    expect(output.text()).toContain('User code: ABCD-EFGH')
    expect(output.text()).toContain('Authenticated to https://cimi.example.com as ada@example.com.')
    expect(output.text()).not.toContain('session-token')

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://cimi.example.com/api/auth/device/code',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'https://cimi.example.com/api/auth/get-session',
      expect.objectContaining({
        headers: { authorization: 'Bearer session-token' },
      }),
    )
  })

  test('rejects a verification URL from another origin', async () => {
    const output = memoryOutput()
    const { store } = memoryCredentialStore()
    const run = createAuthLogin({
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        response({
          device_code: 'device-code',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://evil.example.com/device',
          verification_uri_complete: 'https://evil.example.com/device?user_code=ABCD-EFGH',
          expires_in: 900,
          interval: 5,
        }),
      ),
      store,
      openUrl: vi.fn(async () => true),
      sleep: vi.fn(async () => undefined),
      now: () => 1_700_000_000_000,
    })

    await expect(run({ originInput: 'https://cimi.example.com', output })).resolves.toEqual({
      ok: false,
      failure: { kind: 'verification-url-invalid' },
    })
  })

  test('backs off after slow down and reports a denied request', async () => {
    const output = memoryOutput()
    const { store } = memoryCredentialStore()
    let now = 1_700_000_000_000
    const sleep = vi.fn(async (milliseconds: number) => {
      now += milliseconds
    })
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        response({
          device_code: 'device-code',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://cimi.example.com/device',
          verification_uri_complete: 'https://cimi.example.com/device?user_code=ABCD-EFGH',
          expires_in: 900,
          interval: 5,
        }),
      )
      .mockResolvedValueOnce(response({ error: 'slow_down' }, 400))
      .mockResolvedValueOnce(response({ error: 'access_denied' }, 400))
    const run = createAuthLogin({
      fetch,
      store,
      openUrl: vi.fn(async () => true),
      sleep,
      now: () => now,
    })

    await expect(run({ originInput: 'https://cimi.example.com', output })).resolves.toEqual({
      ok: false,
      failure: { kind: 'authorization-failed', reason: 'denied' },
    })
    expect(sleep).toHaveBeenNthCalledWith(1, 5_000)
    expect(sleep).toHaveBeenNthCalledWith(2, 10_000)
  })
})
