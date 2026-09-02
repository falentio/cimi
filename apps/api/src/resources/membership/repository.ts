import type { OrganizationRole } from '../organization/repository.ts'

export interface MembershipRecord {
  readonly organizationId: string
  readonly userId: string
  readonly role: OrganizationRole
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface MembershipRepository {
  findMany(options: {
    organizationId: string
    offset: number
    limit: number
  }): Promise<MembershipRepository.Page>
  findAll(organizationId: string): Promise<MembershipRecord[]>
  findByUser(options: {
    organizationId: string
    userId: string
  }): Promise<MembershipRecord | undefined>
  findById(options: {
    organizationId: string
    userId: string
  }): Promise<MembershipRecord | undefined>
  findOwner(organizationId: string): Promise<MembershipRecord | undefined>
  findAuthorityOrganizationId(organizationId: string): Promise<string | undefined>
  isOwnerInvariantValid(organizationId: string): Promise<boolean>
  hasPendingGovernanceOperation(organizationId: string): Promise<boolean>
  replaceMembers(organizationId: string, members: MembershipRecord[]): Promise<void>
  updateRole(options: {
    organizationId: string
    userId: string
    role: OrganizationRole
    updatedAt: Date
  }): Promise<MembershipRecord | undefined>
  delete(options: { organizationId: string; userId: string }): Promise<boolean>
  createTransfer(options: {
    id: string
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    now: Date
  }): Promise<MembershipRepository.TransferAdmission>
  findPendingTransfer(organizationId: string): Promise<MembershipRepository.Transfer | undefined>
  findCompletedTransfer(options: {
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
  }): Promise<MembershipRecord | undefined>
  createMembershipOperation(
    input: MembershipRepository.CreateMembershipOperationInput,
  ): Promise<MembershipRepository.MembershipOperation>
  findPendingMembershipOperation(
    organizationId: string,
  ): Promise<MembershipRepository.MembershipOperation | undefined>
  incrementMembershipAttempt(id: string): Promise<void>
  completeMembershipOperation(id: string): Promise<void>
  failMembershipOperation(options: {
    id: string
    failureCode: string
    failureMessage: string
  }): Promise<void>
  markTransferAttempt(options: { id: string; now: Date }): Promise<void>
  completeTransfer(options: {
    id: string
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    now: Date
  }): Promise<MembershipRecord>
  failTransfer(options: {
    id: string
    now: Date
    failureCode: string
    failureMessage: string
  }): Promise<void>
}

export namespace MembershipRepository {
  export interface Page {
    readonly items: MembershipRecord[]
    readonly nextOffset: number | null
    readonly hasMore: boolean
    readonly totalCount: number
  }

  export interface Transfer {
    readonly id: string
    readonly organizationId: string
    readonly previousOwnerUserId: string
    readonly targetUserId: string
    readonly attemptCount: number
  }

  export interface CreateMembershipOperationInput {
    readonly id: string
    readonly organizationId: string
    readonly operationType: 'change-member-role' | 'remove-member' | 'leave-organization'
    readonly targetUserId: string
    readonly targetRole: 'admin' | 'member' | null
    readonly now: Date
  }

  export interface MembershipOperation {
    readonly id: string
    readonly organizationId: string
    readonly operationType: 'change-member-role' | 'remove-member' | 'leave-organization'
    readonly targetUserId: string
    readonly targetRole: 'admin' | 'member' | null
    readonly attemptCount: number
  }

  export type TransferAdmission =
    | { readonly kind: 'admitted'; readonly transfer: Transfer }
    | { readonly kind: 'already-pending'; readonly transfer: Transfer }
    | { readonly kind: 'invalid' }
}
