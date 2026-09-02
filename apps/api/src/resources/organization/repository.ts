export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface OrganizationRecord {
  readonly id: string
  readonly name: string
  readonly authorityOrganizationId: string | null
  readonly ownerUserId: string
  readonly isPersonal: boolean
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface OrganizationRepository {
  findManyForUser(options: {
    userId: string
    offset: number
    limit: number
  }): Promise<OrganizationRepository.Page>
  findById(id: string): Promise<OrganizationRecord | undefined>
  findByAuthorityId(authorityOrganizationId: string): Promise<OrganizationRecord | undefined>
  findByIdForUser(id: string, userId: string): Promise<OrganizationRecord | undefined>
  findPersonalByOwner(ownerUserId: string): Promise<OrganizationRecord | undefined>
  findRoleForUser(organizationId: string, userId: string): Promise<OrganizationRole | undefined>
  isOwnerInvariantValid(organizationId: string): Promise<boolean>
  insert(input: OrganizationRepository.InsertInput): Promise<OrganizationRecord>
  insertWithOwner(
    input: OrganizationRepository.InsertInput,
    membership: { readonly userId: string; readonly now: Date },
  ): Promise<OrganizationRecord>
  updateName(id: string, name: string): Promise<OrganizationRecord | undefined>
  findPendingCreateRepair(
    ownerUserId: string,
  ): Promise<OrganizationRepository.RepairOperation | undefined>
  findPendingUpdateRepair(
    organizationId: string,
  ): Promise<OrganizationRepository.RepairOperation | undefined>
  createRepairOperation(
    input: OrganizationRepository.CreateRepairOperationInput,
  ): Promise<OrganizationRepository.RepairOperation>
  incrementRepairAttempt(repairId: string): Promise<void>
  setRepairAuthorityCleanupRequired(repairId: string): Promise<void>
  setRepairAuthorityOrganization(
    repairId: string,
    authorityOrganizationId: string,
    authorityCleanupRequired: boolean,
  ): Promise<void>
  recordRepairFailure(repairId: string, failureMessage: string): Promise<void>
  completeRepairOperation(repairId: string): Promise<boolean>
  insertWithOwnerAndCompleteRepair(
    input: OrganizationRepository.InsertInput,
    membership: { readonly userId: string; readonly now: Date },
    repairId: string,
  ): Promise<OrganizationRecord>
  updateNameAndCompleteRepair(
    id: string,
    name: string,
    repairId: string,
  ): Promise<OrganizationRecord | undefined>
  checkDelete(id: string): Promise<OrganizationRepository.DeleteResult>
  delete(id: string): Promise<boolean>
  deleteIfEmpty(id: string): Promise<OrganizationRepository.DeleteResult>
  createDeleteOperation(
    input: OrganizationRepository.CreateDeleteOperationInput,
  ): Promise<OrganizationRepository.DeleteOperation>
  findPendingDeleteOperation(
    organizationId: string,
  ): Promise<OrganizationRepository.DeleteOperation | undefined>
  incrementDeleteAttempt(operationId: string): Promise<void>
  recordDeleteFailure(operationId: string, failureMessage: string): Promise<void>
  finalizeDeleteOperation(operationId: string): Promise<boolean>
  hasPendingGovernanceOperation(organizationId: string): Promise<boolean>
}

export namespace OrganizationRepository {
  export interface InsertInput {
    readonly id: string
    readonly name: string
    readonly authorityOrganizationId: string | null
    readonly ownerUserId: string
    readonly isPersonal: boolean
    readonly createdAt: Date
    readonly updatedAt: Date
  }

  export interface Page {
    readonly items: OrganizationRecord[]
    readonly nextOffset: number | null
    readonly hasMore: boolean
    readonly totalCount: number
  }

  export interface CreateRepairOperationInput {
    readonly id: string
    readonly organizationId: string | null
    readonly localOrganizationId: string
    readonly operationType: 'create-organization' | 'update-organization'
    readonly ownerUserId: string
    readonly authorityOrganizationId: string | null
    readonly authorityCleanupRequired: boolean
    readonly authoritySlug: string | null
    readonly previousName: string | null
    readonly desiredName: string
    readonly requestedAt: Date
    readonly createdAt: Date
    readonly updatedAt: Date
  }

  export interface RepairOperation {
    readonly id: string
    readonly organizationId: string | null
    readonly localOrganizationId: string
    readonly operationType: 'create-organization' | 'update-organization'
    readonly ownerUserId: string
    readonly authorityOrganizationId: string | null
    readonly authorityCleanupRequired: boolean
    readonly authoritySlug: string | null
    readonly previousName: string | null
    readonly desiredName: string
    readonly attemptCount: number
  }

  export interface CreateDeleteOperationInput {
    readonly id: string
    readonly organizationId: string
    readonly previousOwnerUserId: string
    readonly targetUserId: string
    readonly requestedAt: Date
    readonly createdAt: Date
    readonly updatedAt: Date
  }

  export interface DeleteOperation {
    readonly id: string
    readonly organizationId: string
    readonly previousOwnerUserId: string
    readonly targetUserId: string
    readonly attemptCount: number
  }

  export type DeleteResult =
    | { readonly kind: 'missing' }
    | { readonly kind: 'not-empty'; readonly isPersonal: boolean }
    | { readonly kind: 'deletable'; readonly isPersonal: boolean }
    | { readonly kind: 'deleted' }
}
