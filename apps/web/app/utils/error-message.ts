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

export function localizeErrorMessage(
  error: LocalizableError,
  translate: (key: string) => string,
): string {
  if (error.code === undefined) return error.message

  const key = contractErrorMessageKeys[error.code as ContractErrorCode]
  return key === undefined ? error.message : translate(key)
}
