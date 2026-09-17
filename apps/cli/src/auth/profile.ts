import type { ServerOrigin } from './origin.ts'

export type BearerToken = string & { readonly __brand: 'CimiBearerToken' }

export interface CredentialProfile {
  readonly formatVersion: 1
  readonly origin: ServerOrigin
  readonly accessToken: BearerToken
  readonly tokenType: 'Bearer'
  readonly expiresAt: number | undefined
  readonly user: {
    readonly id: string
    readonly name: string
    readonly email: string
    readonly role: string | null
  }
  readonly authenticatedAt: number
}

export interface SecretStore {
  read(service: string, account: string): Promise<string | null>
  write(service: string, account: string, value: string): Promise<void>
}

export interface CredentialStore {
  read(origin: ServerOrigin): Promise<CredentialProfile | undefined>
  write(profile: CredentialProfile): Promise<void>
}

const SERVICE_NAME = 'cimi'

export function parseBearerToken(value: unknown): BearerToken | undefined {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) return undefined
  return value as BearerToken
}

export function createCredentialStore(secrets: SecretStore): CredentialStore {
  return {
    async read(origin) {
      const value = await secrets.read(SERVICE_NAME, accountFor(origin))
      if (value === null) return undefined
      const profile = parseCredentialProfile(value)
      if (profile === undefined || profile.origin.value !== origin.value) {
        throw new Error('Stored credentials are invalid')
      }
      return profile
    },
    async write(profile) {
      await secrets.write(SERVICE_NAME, accountFor(profile.origin), JSON.stringify(profile))
    },
  }
}

function accountFor(origin: ServerOrigin): string {
  return Buffer.from(origin.value, 'utf8').toString('base64url')
}

function parseCredentialProfile(value: string): CredentialProfile | undefined {
  let candidate: unknown
  try {
    candidate = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!isRecord(candidate)) return undefined

  const origin = candidate['origin']
  const user = candidate['user']
  const accessToken = parseBearerToken(candidate['accessToken'])
  if (
    candidate['formatVersion'] !== 1 ||
    !isRecord(origin) ||
    origin['kind'] !== 'server-origin' ||
    typeof origin['value'] !== 'string' ||
    typeof origin['hostname'] !== 'string' ||
    accessToken === undefined ||
    candidate['tokenType'] !== 'Bearer' ||
    !isRecord(user) ||
    typeof user['id'] !== 'string' ||
    typeof user['name'] !== 'string' ||
    typeof user['email'] !== 'string' ||
    (user['role'] !== null && typeof user['role'] !== 'string') ||
    !isOptionalTimestamp(candidate['expiresAt']) ||
    typeof candidate['authenticatedAt'] !== 'number'
  ) {
    return undefined
  }

  return {
    formatVersion: 1,
    origin: {
      kind: 'server-origin',
      value: origin['value'],
      hostname: origin['hostname'],
    },
    accessToken,
    tokenType: 'Bearer',
    expiresAt: candidate['expiresAt'],
    user: {
      id: user['id'],
      name: user['name'],
      email: user['email'],
      role: user['role'],
    },
    authenticatedAt: candidate['authenticatedAt'],
  }
}

function isOptionalTimestamp(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
