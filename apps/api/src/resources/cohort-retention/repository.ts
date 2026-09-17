import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface CohortRepository {
  findById(
    input: CohortRepository.IdentityInput | CohortRepository.UnscopedIdentityInput,
  ): Promise<CohortRepository.Cohort | undefined>
  findVersionAt(input: CohortRepository.VersionInput): Promise<CohortRepository.Cohort | undefined>
  findMany(input: CohortRepository.ListInput): Promise<CohortRepository.ListResult>
  insert(input: CohortRepository.InsertInput): Promise<CohortRepository.Cohort>
  update(input: CohortRepository.UpdateInput): Promise<CohortRepository.MutationResult>
  archive(input: CohortRepository.ArchiveInput): Promise<CohortRepository.MutationResult>
}

export declare namespace CohortRepository {
  export type Cohort = InferOutput<typeof schema.SCohort>
  export type Definition = InferOutput<typeof schema.SCohortDefinitionFields>

  export interface IdentityInput {
    readonly siteId: string
    readonly cohortId: string
  }

  export interface UnscopedIdentityInput {
    readonly cohortId: string
  }

  export interface VersionInput extends IdentityInput {
    readonly at: Date
  }

  export interface ArchiveInput extends IdentityInput {
    readonly now: Date
  }

  export interface ListInput {
    readonly siteId: string
    readonly offset: number
    readonly limit: number
  }

  export interface ListResult {
    readonly items: Cohort[]
    readonly nextOffset: number | null
    readonly hasMore: boolean
    readonly totalCount: number
  }

  export interface InsertInput extends Definition {
    readonly id: string
    readonly siteId: string
    readonly now: Date
  }

  export interface UpdateInput extends IdentityInput, Definition {
    readonly now: Date
  }

  export type MutationResult =
    | { readonly status: 'updated'; readonly cohort: Cohort }
    | { readonly status: 'not-found' }
    | { readonly status: 'conflict' }
}
