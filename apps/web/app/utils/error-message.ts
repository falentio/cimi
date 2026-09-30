import type { Auth } from '@cimi/auth'
import type { ContractErrorCode } from '@cimi/contract'

export interface LocalizableError {
  readonly code?: string
  readonly status?: number
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
 * Error codes Better Auth declares for the plugins this app configures. It
 * covers the codes the current email/password flow can reach plus the rest of
 * the registry, so enabling social sign-in or the admin endpoints later does
 * not silently fall back to English.
 */
export type BetterAuthErrorCode =
  | 'BANNED_USER'
  | 'CROSS_SITE_NAVIGATION_LOGIN_BLOCKED'
  | 'EMAIL_NOT_VERIFIED'
  | 'FAILED_TO_CREATE_SESSION'
  | 'FAILED_TO_CREATE_USER'
  | 'FAILED_TO_GET_SESSION'
  | 'FAILED_TO_GET_USER_INFO'
  | 'FIELD_NOT_ALLOWED'
  | 'ID_TOKEN_NOT_SUPPORTED'
  | 'INVALID_CALLBACK_URL'
  | 'INVALID_EMAIL'
  | 'INVALID_EMAIL_OR_PASSWORD'
  | 'INVALID_ERROR_CALLBACK_URL'
  | 'INVALID_NEW_USER_CALLBACK_URL'
  | 'INVALID_ORIGIN'
  | 'INVALID_PASSWORD'
  | 'INVALID_REDIRECT_URL'
  | 'INVALID_TOKEN'
  | 'METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED'
  | 'MISSING_OR_NULL_ORIGIN'
  | 'PASSWORD_TOO_LONG'
  | 'PASSWORD_TOO_SHORT'
  | 'PROVIDER_NOT_FOUND'
  | 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL'
  | 'USER_EMAIL_NOT_FOUND'
  | 'VALIDATION_ERROR'

/**
 * Codes the auth routes return without going through Better Auth's error
 * registry, so no type can be derived for them. Three are thrown as inline
 * `code:` literals (`EMAIL_PASSWORD_DISABLED`, `EMAIL_PASSWORD_SIGN_UP_DISABLED`,
 * `OAUTH_LINK_ERROR`) and `UNSUPPORTED_MEDIA_TYPE` comes from the `better-call`
 * transport layer. Verified reachable against better-auth 1.7.1 and
 * better-call 1.4.0.
 */
export type AuthTransportErrorCode =
  | 'EMAIL_PASSWORD_DISABLED'
  | 'EMAIL_PASSWORD_SIGN_UP_DISABLED'
  | 'OAUTH_LINK_ERROR'
  | 'UNSUPPORTED_MEDIA_TYPE'

export type AuthErrorCode = BetterAuthErrorCode | AuthTransportErrorCode

type AssertTrue<T extends true> = T

/**
 * Fails to compile when `BetterAuthErrorCode` names a code Better Auth does not
 * define. The mapped type only type-checks while every code is a real key of
 * `Auth['$ERROR_CODES']`, so a typo or an upstream rename stops compiling.
 */
export type BetterAuthErrorCodeAssertion = AssertTrue<
  {
    [Code in BetterAuthErrorCode]: AssertTrue<
      Code extends keyof Auth['$ERROR_CODES'] ? true : false
    >
  }[BetterAuthErrorCode]
>

export const authErrorMessageKeys = {
  BANNED_USER: 'authErrors.BANNED_USER',
  CROSS_SITE_NAVIGATION_LOGIN_BLOCKED: 'authErrors.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED',
  EMAIL_NOT_VERIFIED: 'authErrors.EMAIL_NOT_VERIFIED',
  EMAIL_PASSWORD_DISABLED: 'authErrors.EMAIL_PASSWORD_DISABLED',
  EMAIL_PASSWORD_SIGN_UP_DISABLED: 'authErrors.EMAIL_PASSWORD_SIGN_UP_DISABLED',
  FAILED_TO_CREATE_SESSION: 'authErrors.FAILED_TO_CREATE_SESSION',
  FAILED_TO_CREATE_USER: 'authErrors.FAILED_TO_CREATE_USER',
  FAILED_TO_GET_SESSION: 'authErrors.FAILED_TO_GET_SESSION',
  FAILED_TO_GET_USER_INFO: 'authErrors.FAILED_TO_GET_USER_INFO',
  FIELD_NOT_ALLOWED: 'authErrors.FIELD_NOT_ALLOWED',
  ID_TOKEN_NOT_SUPPORTED: 'authErrors.ID_TOKEN_NOT_SUPPORTED',
  INVALID_CALLBACK_URL: 'authErrors.INVALID_CALLBACK_URL',
  INVALID_EMAIL: 'authErrors.INVALID_EMAIL',
  INVALID_EMAIL_OR_PASSWORD: 'authErrors.INVALID_EMAIL_OR_PASSWORD',
  INVALID_ERROR_CALLBACK_URL: 'authErrors.INVALID_ERROR_CALLBACK_URL',
  INVALID_NEW_USER_CALLBACK_URL: 'authErrors.INVALID_NEW_USER_CALLBACK_URL',
  INVALID_ORIGIN: 'authErrors.INVALID_ORIGIN',
  INVALID_PASSWORD: 'authErrors.INVALID_PASSWORD',
  INVALID_REDIRECT_URL: 'authErrors.INVALID_REDIRECT_URL',
  INVALID_TOKEN: 'authErrors.INVALID_TOKEN',
  METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED: 'authErrors.METHOD_NOT_ALLOWED_DEFER_SESSION_REQUIRED',
  MISSING_OR_NULL_ORIGIN: 'authErrors.MISSING_OR_NULL_ORIGIN',
  OAUTH_LINK_ERROR: 'authErrors.OAUTH_LINK_ERROR',
  PASSWORD_TOO_LONG: 'authErrors.PASSWORD_TOO_LONG',
  PASSWORD_TOO_SHORT: 'authErrors.PASSWORD_TOO_SHORT',
  PROVIDER_NOT_FOUND: 'authErrors.PROVIDER_NOT_FOUND',
  UNSUPPORTED_MEDIA_TYPE: 'authErrors.UNSUPPORTED_MEDIA_TYPE',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'authErrors.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  USER_EMAIL_NOT_FOUND: 'authErrors.USER_EMAIL_NOT_FOUND',
  VALIDATION_ERROR: 'authErrors.VALIDATION_ERROR',
} satisfies Record<AuthErrorCode, string>

const errorMessageKeys: Record<string, string> = {
  ...contractErrorMessageKeys,
  ...authErrorMessageKeys,
}

/**
 * Statuses whose response carries no error code, mapped onto the contract code
 * that means the same thing. Better Auth answers a throttled sign-in with a
 * bare `{"message":"Too many requests. Please try again later."}`, so a status
 * lookup is the only way to localize it.
 *
 * 422 is omitted because no contract code means the same thing.
 */
const statusFallbackCodes = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_SERVER_ERROR',
  503: 'SERVICE_UNAVAILABLE',
  507: 'INSUFFICIENT_STORAGE',
} satisfies Record<number, ContractErrorCode>

function errorMessageKey(error: LocalizableError): string | undefined {
  if (error.code !== undefined && Object.hasOwn(errorMessageKeys, error.code)) {
    return errorMessageKeys[error.code]
  }

  if (error.status === undefined) return undefined

  if (!Object.hasOwn(statusFallbackCodes, error.status)) return undefined

  const fallbackCode = statusFallbackCodes[error.status as keyof typeof statusFallbackCodes]
  return contractErrorMessageKeys[fallbackCode]
}

/**
 * Reports whether `localizeErrorMessage` can translate this error. An error
 * with neither a code nor a status can only be shown as its raw message, which
 * is whatever the server sent.
 */
export function isLocalizableError(error: LocalizableError): boolean {
  return errorMessageKey(error) !== undefined
}

export function localizeErrorMessage(
  error: LocalizableError,
  translate: (key: string) => string,
): string {
  const key = errorMessageKey(error)
  return key === undefined ? error.message : translate(key)
}
