export {
  account as TAccount,
  deviceCode as TDeviceCode,
  authInvitation as TAuthInvitation,
  authMember as TAuthMember,
  authOrganization as TAuthOrganization,
  session as TSession,
  user as TUser,
  verification as TVerification,
} from './auth.generated.ts'

import {
  account,
  deviceCode,
  authInvitation,
  authMember,
  authOrganization,
  session,
  user,
  verification,
} from './auth.generated.ts'

export const betterAuthSchema = {
  user,
  session,
  account,
  deviceCode,
  verification,
  authOrganization,
  authMember,
  authInvitation,
} as const
