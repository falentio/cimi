import type { ErrorMap } from '@orpc/contract'

export const ERROR_CATALOG = {
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    status: 401,
    message: 'Authentication is required.',
  },
  FORBIDDEN: {
    code: 'FORBIDDEN',
    status: 403,
    message: 'You do not have permission to perform this operation.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    status: 404,
    message: 'The requested resource was not found.',
  },
  BAD_REQUEST: {
    code: 'BAD_REQUEST',
    status: 400,
    message: 'The request is invalid.',
  },
  CONFLICT: {
    code: 'CONFLICT',
    status: 409,
    message: 'The operation conflicts with the current state.',
  },
  OWNER_PROTECTED: {
    code: 'OWNER_PROTECTED',
    status: 409,
    message: 'The organization owner is protected from this operation.',
  },
  ORGANIZATION_NOT_EMPTY: {
    code: 'ORGANIZATION_NOT_EMPTY',
    status: 409,
    message: 'The organization still owns Sites or memberships.',
  },
  PERSONAL_ORGANIZATION_PROTECTED: {
    code: 'PERSONAL_ORGANIZATION_PROTECTED',
    status: 409,
    message: 'The Personal Organization cannot be removed.',
  },
  INVITATION_CONSUMED: {
    code: 'INVITATION_CONSUMED',
    status: 409,
    message: 'The invitation has already been consumed.',
  },
  QUERY_LIMIT_EXCEEDED: {
    code: 'QUERY_LIMIT_EXCEEDED',
    status: 422,
    message: 'The requested query exceeds the available data or work budget.',
  },
  INCOMPATIBLE_BACKUP: {
    code: 'INCOMPATIBLE_BACKUP',
    status: 422,
    message: 'The backup is not compatible with this installation.',
  },
  BACKUP_FAILED: {
    code: 'BACKUP_FAILED',
    status: 500,
    message: 'The backup operation failed safely.',
  },
  UPGRADE_FAILED: {
    code: 'UPGRADE_FAILED',
    status: 500,
    message: 'The upgrade operation failed safely.',
  },
  PAYLOAD_TOO_LARGE: {
    code: 'PAYLOAD_TOO_LARGE',
    status: 413,
    message: 'The request payload is too large.',
  },
  TOO_MANY_REQUESTS: {
    code: 'TOO_MANY_REQUESTS',
    status: 429,
    message: 'Too many requests.',
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
    message: 'The service is temporarily unavailable.',
  },
  INSUFFICIENT_STORAGE: {
    code: 'INSUFFICIENT_STORAGE',
    status: 507,
    message: 'The configured storage cannot complete this operation.',
  },
  INTERNAL_SERVER_ERROR: {
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'The operation could not be completed safely.',
  },
  RESTORE_FAILED: {
    code: 'RESTORE_FAILED',
    status: 500,
    message: 'The restore operation failed safely.',
  },
  RETENTION_FAILED: {
    code: 'RETENTION_FAILED',
    status: 500,
    message: 'The retention operation failed safely.',
  },
  CLEANUP_FAILED: {
    code: 'CLEANUP_FAILED',
    status: 500,
    message: 'The cleanup operation failed safely.',
  },
} as const

export type ContractErrorCode = keyof typeof ERROR_CATALOG
export type ContractErrorDefinition = (typeof ERROR_CATALOG)[ContractErrorCode]

export const ERRORS = ERROR_CATALOG

export function getErrorDefinition(code: ContractErrorCode): ContractErrorDefinition {
  return ERROR_CATALOG[code]
}

export function toORPCErrorMap<const Codes extends readonly ContractErrorCode[]>(
  ...codes: Codes
): ErrorMap {
  return Object.fromEntries(
    codes.map((code) => {
      const { status, message } = ERROR_CATALOG[code]
      return [code, { status, message }]
    }),
  )
}
