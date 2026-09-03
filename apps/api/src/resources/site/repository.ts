import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface SiteRepository {
  findById(siteId: string): Promise<SiteRepository.SiteRecord | undefined>
  findMany(
    organizationId: string,
    options: SiteRepository.FindManyOptions,
  ): Promise<SiteRepository.FindManyResult>
  insert(input: SiteRepository.CreateInput): Promise<SiteRepository.Site>
  updateActive(input: SiteRepository.UpdateInput): Promise<SiteRepository.Site | undefined>
  rotateIngestionIdentifier(
    siteId: string,
    ingestionIdentifier: string,
  ): Promise<SiteRepository.Site | undefined>
  beginDelete(input: SiteRepository.BeginDeleteInput): Promise<SiteRepository.LifecycleResult>
  beginRecover(input: SiteRepository.BeginRecoverInput): Promise<SiteRepository.LifecycleResult>
  completeDelete(
    input: SiteRepository.CompleteDeleteInput,
  ): Promise<SiteRepository.LifecycleExecutionResult>
  completeRecover(
    input: SiteRepository.CompleteRecoverInput,
  ): Promise<SiteRepository.LifecycleExecutionResult>
  purge(input: SiteRepository.PurgeInput): Promise<SiteRepository.LifecycleExecutionResult>
  findPendingLifecycleOperations(): Promise<SiteRepository.LifecycleOperation[]>
  findDuePurges(requestedAt: Date): Promise<SiteRepository.DuePurge[]>
  getDeletionStatus(siteId: string): Promise<SiteRepository.DeletionStatus | undefined>
}

export declare namespace SiteRepository {
  export type Site = InferOutput<typeof schema.SSite>
  export type LifecycleStatus = InferOutput<typeof schema.SSiteLifecycleStatus>
  export type CleanupStatus = 'not-required' | 'pending' | 'complete' | 'failed'
  export type FindManyResult = InferOutput<typeof schema.SSiteListOutput>

  export interface SiteRecord extends Site {
    status: LifecycleStatus
    deleteRequestedAt: string | null
    deletedAt: string | null
    recoveryDeadline: string | null
    purgeAt: string | null
    purgedAt: string | null
    currentOperationId: string | null
    cleanupStatus: CleanupStatus
    cleanupUpdatedAt: string | null
    cleanupError: string | null
  }

  export interface FindManyOptions {
    offset: number
    limit: number
  }

  export interface CreateInput {
    id: string
    organizationId: string
    name: string
    hostname: string
    ingestionIdentifier: string
    reportingTimezone: string
    weekStartsOn: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
    createdAt: Date
    updatedAt: Date
  }

  export interface UpdateInput {
    siteId: string
    name: string
    hostname: string
    reportingTimezone: string
    weekStartsOn: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  }

  export interface BeginDeleteInput {
    siteId: string
    operationId: string
    requestedAt: Date
  }

  export interface BeginRecoverInput {
    siteId: string
    operationId: string
    requestedAt: Date
  }

  export interface CompleteDeleteInput {
    siteId: string
    operationId: string
    completedAt: Date
  }

  export interface CompleteRecoverInput {
    siteId: string
    operationId: string
    completedAt: Date
  }

  export interface PurgeInput {
    siteId: string
    operationId: string
    requestedAt: Date
  }

  export interface LifecycleOperation {
    siteId: string
    operationId: string
    operationType: 'delete' | 'recover'
    status: 'pending' | 'running'
  }

  export interface DuePurge {
    siteId: string
  }

  export type LifecycleResult =
    | { status: 'accepted'; operationId: string }
    | { status: 'not-found' }
    | { status: 'conflict'; currentStatus: LifecycleStatus }

  export type LifecycleExecutionResult =
    | { status: 'completed' }
    | { status: 'not-found' }
    | { status: 'conflict'; currentStatus: LifecycleStatus }

  export interface DeletionStatus {
    siteId: string
    status: LifecycleStatus
    operationId: string | null
    requestedAt: string | null
    deletedAt: string | null
    recoveryDeadline: string | null
    purgeAt: string | null
    cleanup: {
      status: CleanupStatus
      updatedAt: string
      error: string | null
    }
  }
}
