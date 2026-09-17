import { betterAuth } from 'better-auth'
import { admin, bearer, deviceAuthorization, organization } from 'better-auth/plugins'
import { CLI_AUTH_CLIENT_ID } from './device.ts'
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
    bearer(),
    deviceAuthorization({
      verificationUri: '/device',
      validateClient: (clientId) => clientId === CLI_AUTH_CLIENT_ID,
    }),
    firstUserAdmin(),
  ],
})
