import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { DB } from 'better-auth/adapters/drizzle'
import { admin, organization } from 'better-auth/plugins'
import { firstUserAdmin } from './first-user-admin.ts'

export interface CreateAuthDependencies {
  db: DB
  schema?: Record<string, unknown> | undefined
  baseURL?: string | undefined
  secret?: string | undefined
}

export function createAuth(deps: CreateAuthDependencies) {
  return betterAuth({
    ...(deps.baseURL && { baseURL: deps.baseURL }),
    ...(deps.secret && { secret: deps.secret }),
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

export type AuthUser = Auth['$Infer']['Session']['user']
