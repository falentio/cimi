export type IdentityRedactionReason = 'explicit' | 'retention'

export interface IdentityRedactionRequestValues {
  readonly reason: IdentityRedactionReason
  readonly status: 'requested'
  readonly requestedAt: Date
  readonly appliedAt: null
  readonly derivedCleanupStatus: 'pending'
  readonly backupCleanupStatus: 'pending'
  readonly derivedCleanupUpdatedAt: Date
  readonly backupCleanupUpdatedAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

export function identityRedactionRequest(input: {
  readonly reason: IdentityRedactionReason
  readonly now: Date
}): IdentityRedactionRequestValues {
  return {
    reason: input.reason,
    status: 'requested',
    requestedAt: input.now,
    appliedAt: null,
    derivedCleanupStatus: 'pending',
    backupCleanupStatus: 'pending',
    derivedCleanupUpdatedAt: input.now,
    backupCleanupUpdatedAt: input.now,
    createdAt: input.now,
    updatedAt: input.now,
  }
}
