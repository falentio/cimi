import type { ContractErrorCode } from '@cimi/contract'

export interface LocalizableError {
  readonly code?: string
  readonly message: string
}

const contractErrorMessageKeys = {
  UNAUTHORIZED: 'errors.UNAUTHORIZED',
  FORBIDDEN: 'errors.FORBIDDEN',
  NOT_FOUND: 'errors.NOT_FOUND',
  BAD_REQUEST: 'errors.BAD_REQUEST',
  CONFLICT: 'errors.CONFLICT',
  OWNER_PROTECTED: 'errors.OWNER_PROTECTED',
  ORGANIZATION_NOT_EMPTY: 'errors.ORGANIZATION_NOT_EMPTY',
  PERSONAL_ORGANIZATION_PROTECTED: 'errors.PERSONAL_ORGANIZATION_PROTECTED',
  INVITATION_CONSUMED: 'errors.INVITATION_CONSUMED',
  QUERY_LIMIT_EXCEEDED: 'errors.QUERY_LIMIT_EXCEEDED',
  INCOMPATIBLE_BACKUP: 'errors.INCOMPATIBLE_BACKUP',
  BACKUP_FAILED: 'errors.BACKUP_FAILED',
  UPGRADE_FAILED: 'errors.UPGRADE_FAILED',
  PAYLOAD_TOO_LARGE: 'errors.PAYLOAD_TOO_LARGE',
  TOO_MANY_REQUESTS: 'errors.TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'errors.SERVICE_UNAVAILABLE',
  INSUFFICIENT_STORAGE: 'errors.INSUFFICIENT_STORAGE',
  INTERNAL_SERVER_ERROR: 'errors.INTERNAL_SERVER_ERROR',
  RESTORE_FAILED: 'errors.RESTORE_FAILED',
  RETENTION_FAILED: 'errors.RETENTION_FAILED',
  CLEANUP_FAILED: 'errors.CLEANUP_FAILED',
} satisfies Record<ContractErrorCode, string>

/**
 * Error codes the Better Auth routes behind the auth pages can return.
 *
 * Better Auth publishes no public type for these, so the reachable set is
 * pinned here: `sign-in/email`, `sign-up/email`, and `get-session`. Every code
 * those routes raise is listed, which keeps the fallback to the raw English
 * server message reserved for codes that are genuinely not covered.
 */
export type BetterAuthErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'EMAIL_PASSWORD_DISABLED'
  | 'EMAIL_PASSWORD_SIGN_UP_DISABLED'
  | 'FAILED_TO_CREATE_SESSION'
  | 'FAILED_TO_CREATE_USER'
  | 'FAILED_TO_GET_SESSION'
  | 'FAILED_TO_GET_USER_INFO'
  | 'ID_TOKEN_NOT_SUPPORTED'
  | 'INVALID_EMAIL'
  | 'INVALID_EMAIL_OR_PASSWORD'
  | 'INVALID_PASSWORD'
  | 'INVALID_TOKEN'
  | 'OAUTH_LINK_ERROR'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_SHORT'
  | 'PROVIDER_NOT_FOUND'
  | 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
  | 'USER_EMAIL_NOT_FOUND'

export const betterAuthErrorMessageKeys = {
  EMAIL_NOT_VERIFIED: 'authErrors.EMAIL_NOT_VERIFIED',
  EMAIL_PASSWORD_DISABLED: 'authErrors.EMAIL_PASSWORD_DISABLED',
  EMAIL_PASSWORD_SIGN_UP_DISABLED: 'authErrors.EMAIL_PASSWORD_SIGN_UP_DISABLED',
  FAILED_TO_CREATE_SESSION: 'authErrors.FAILED_TO_CREATE_SESSION',
  FAILED_TO_CREATE_USER: 'authErrors.FAILED_TO_CREATE_USER',
  FAILED_TO_GET_SESSION: 'authErrors.FAILED_TO_GET_SESSION',
  FAILED_TO_GET_USER_INFO: 'authErrors.FAILED_TO_GET_USER_INFO',
  ID_TOKEN_NOT_SUPPORTED: 'authErrors.ID_TOKEN_NOT_SUPPORTED',
  INVALID_EMAIL: 'authErrors.INVALID_EMAIL',
  INVALID_EMAIL_OR_PASSWORD: 'authErrors.INVALID_EMAIL_OR_PASSWORD',
  INVALID_PASSWORD: 'authErrors.INVALID_PASSWORD',
  INVALID_TOKEN: 'authErrors.INVALID_TOKEN',
  OAUTH_LINK_ERROR: 'authErrors.OAUTH_LINK_ERROR',
  PASSWORD_TOO_LONG: 'authErrors.PASSWORD_TOO_LONG',
  PASSWORD_TOO_SHORT: 'authErrors.PASSWORD_TOO_SHORT',
  PROVIDER_NOT_FOUND: 'authErrors.PROVIDER_NOT_FOUND',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'authErrors.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  USER_EMAIL_NOT_FOUND: 'authErrors.USER_EMAIL_NOT_FOUND',
} satisfies Record<BetterAuthErrorCode, string>

const errorMessageMaps: readonly Record<string, string>[] = [
  contractErrorMessageKeys,
  betterAuthErrorMessageKeys,
]

function errorMessageKey(code: string): string | undefined {
  for (const map of errorMessageMaps) {
    const key = map[code]
    if (key !== undefined) return key
  }

  return undefined
}

export function localizeErrorMessage(
  error: LocalizableError,
  translate: (key: string) => string,
): string {
  if (error.code === undefined) return error.message

  const key = errorMessageKey(error.code)
  return key === undefined ? error.message : translate(key)
}
