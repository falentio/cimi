import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface FunnelRepository {
  findById(
    input: FunnelRepository.IdentityInput | FunnelRepository.UnscopedIdentityInput,
  ): Promise<FunnelRepository.Funnel | undefined>
  findVersionAt(input: FunnelRepository.VersionInput): Promise<FunnelRepository.Funnel | undefined>
  findMany(input: FunnelRepository.ListInput): Promise<FunnelRepository.ListResult>
  insert(input: FunnelRepository.InsertInput): Promise<FunnelRepository.Funnel>
  update(input: FunnelRepository.UpdateInput): Promise<FunnelRepository.MutationResult>
  archive(input: FunnelRepository.ArchiveInput): Promise<FunnelRepository.MutationResult>
}

export declare namespace FunnelRepository {
  export type Funnel = InferOutput<typeof schema.SFunnel>
  export type Definition = InferOutput<typeof schema.SFunnelDefinitionFields>

  export interface IdentityInput {
    readonly siteId: string
    readonly funnelId: string
  }

  export interface UnscopedIdentityInput {
    readonly funnelId: string
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
    readonly items: Funnel[]
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
    | { readonly status: 'updated'; readonly funnel: Funnel }
    | { readonly status: 'not-found' }
    | { readonly status: 'conflict' }
}
