import { betterAuth } from 'better-auth'
import { admin, organization } from 'better-auth/plugins'
import { firstUserAdmin } from './first-user-admin.ts'

export const auth = betterAuth({
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
