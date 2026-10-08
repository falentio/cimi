import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { DB, DrizzleAdapterConfig } from 'better-auth/adapters/drizzle'
import { admin, organization } from 'better-auth/plugins'
import { firstUserAdmin } from './first-user-admin.ts'

/**
 * Origins accepted in development. `localhost` and `*.localhost` cover local
 * ports; `*.falentio` covers the wildcard dev hostnames that systemd-resolved
 * points at loopback (see /etc/systemd/resolved.conf.d/falentio-tld.conf).
 */
export const DEVELOPMENT_TRUSTED_ORIGINS = [
  'http://localhost:*',
  'http://*.localhost:*',
  'http://*.falentio:*',
] as const

export interface CreateAuthDependencies {
  db: DB
  schema?: DrizzleAdapterConfig['schema'] | undefined
  baseURL?: string | undefined
  secret?: string | undefined
  trustedOrigins?: readonly string[] | undefined
}

export function createAuth(deps: CreateAuthDependencies) {
  return betterAuth({
    ...(deps.baseURL && { baseURL: deps.baseURL }),
    ...(deps.secret && { secret: deps.secret }),
    ...(deps.trustedOrigins && { trustedOrigins: [...deps.trustedOrigins] }),
    database: drizzleAdapter(deps.db, {
      provider: 'sqlite',
      ...(deps.schema && { schema: deps.schema }),
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      admin(),
      organization({
        allowUserToCreateOrganization: false,
        schema: {
          organization: { modelName: 'authOrganization' },
          member: { modelName: 'authMember' },
          invitation: { modelName: 'authInvitation' },
        },
      }),
      firstUserAdmin(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>

export type AuthUser = Auth['$Infer']['Session']['user'] & { installationGrant?: boolean }

export function createTestUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'user_1',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
    image: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    role: 'admin',
    banned: false,
    banReason: null,
    banExpires: null,
    installationGrant: true,
    ...overrides,
  }
}
