import { describe, expect, test } from 'vitest'
import { parseServerOrigin } from '../origin.ts'
import {
  createCredentialStore,
  parseBearerToken,
  type CredentialProfile,
  type SecretStore,
} from '../profile.ts'

function memorySecretStore(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async read(service, account) {
      return values.get(`${service}:${account}`) ?? null
    },
    async write(service, account, value) {
      values.set(`${service}:${account}`, value)
    },
  }
}

function profile(input: string, email: string): CredentialProfile {
  const parsed = parseServerOrigin(input)
  if (!parsed.ok) throw new Error('Test origin is invalid')
  const token = parseBearerToken(`token-${email}`)
  if (token === undefined) throw new Error('Test token is invalid')
  return {
    formatVersion: 1,
    origin: parsed.origin,
    accessToken: token,
    tokenType: 'Bearer',
    expiresAt: 1_700_000_000_000,
    user: { id: email, name: email, email, role: null },
    authenticatedAt: 1_700_000_000_000,
  }
}

describe('createCredentialStore', () => {
  test('keeps credentials isolated by canonical origin', async () => {
    const secrets = memorySecretStore()
    const store = createCredentialStore(secrets)
    const first = profile('https://one.example.com', 'one@example.com')
    const second = profile('https://two.example.com', 'two@example.com')

    await store.write(first)
    await store.write(second)

    await expect(store.read(first.origin)).resolves.toEqual(first)
    await expect(store.read(second.origin)).resolves.toEqual(second)
    expect(secrets.values.size).toBe(2)
  })

  test('replaces only the selected origin profile', async () => {
    const store = createCredentialStore(memorySecretStore())
    const first = profile('https://one.example.com', 'one@example.com')
    const replacement = profile('https://one.example.com', 'new@example.com')

    await store.write(first)
    await store.write(replacement)

    await expect(store.read(first.origin)).resolves.toEqual(replacement)
  })

  test('rejects malformed stored profiles', async () => {
    const secrets = memorySecretStore()
    const store = createCredentialStore(secrets)
    const origin = parseServerOrigin('https://one.example.com')
    if (!origin.ok) throw new Error('Test origin is invalid')

    await secrets.write(
      'cimi',
      Buffer.from(origin.origin.value, 'utf8').toString('base64url'),
      '{"formatVersion":2}',
    )

    await expect(store.read(origin.origin)).rejects.toThrow('Stored credentials are invalid')
  })
})
