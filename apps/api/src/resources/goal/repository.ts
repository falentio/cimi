import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface GoalRepository {
  findById(
    input: GoalRepository.IdentityInput | GoalRepository.UnscopedIdentityInput,
  ): Promise<GoalRepository.Goal | undefined>
  findVersionAt(input: GoalRepository.VersionInput): Promise<GoalRepository.Goal | undefined>
  findMany(input: GoalRepository.ListInput): Promise<GoalRepository.ListResult>
  insert(input: GoalRepository.InsertInput): Promise<GoalRepository.Goal>
  update(input: GoalRepository.UpdateInput): Promise<GoalRepository.MutationResult>
  archive(input: GoalRepository.ArchiveInput): Promise<GoalRepository.MutationResult>
}

export declare namespace GoalRepository {
  export type Goal = InferOutput<typeof schema.SGoal>
  export type Definition = InferOutput<typeof schema.SGoalDefinitionFields>

  export interface IdentityInput {
    readonly siteId: string
    readonly goalId: string
  }

  export interface UnscopedIdentityInput {
    readonly goalId: string
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
    readonly items: Goal[]
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
    | { readonly status: 'updated'; readonly goal: Goal }
    | { readonly status: 'not-found' }
    | { readonly status: 'conflict' }
}
