import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'

export interface PublicDashboardRepository {
  findBySiteId(siteId: string): Promise<PublicDashboardRepository.Config | undefined>
  findByIdentifierHash(
    identifierHash: string,
  ): Promise<PublicDashboardRepository.Config | undefined>
  enable(input: PublicDashboardRepository.EnableInput): Promise<PublicDashboardRepository.Mutation>
  disable(
    input: PublicDashboardRepository.DisableInput,
  ): Promise<PublicDashboardRepository.Mutation>
  rotate(input: PublicDashboardRepository.RotateInput): Promise<PublicDashboardRepository.Mutation>
}

export declare namespace PublicDashboardRepository {
  export type Config = InferOutput<typeof schema.SPublicDashboardConfig>

  export interface EnableInput {
    readonly siteId: string
    readonly identifier: string
    readonly identifierHash: string
    readonly now: Date
  }

  export interface DisableInput {
    readonly siteId: string
    readonly now: Date
  }

  export interface RotateInput {
    readonly siteId: string
    readonly identifier: string
    readonly identifierHash: string
    readonly now: Date
  }

  export type Mutation =
    | { readonly status: 'updated'; readonly config: Config }
    | { readonly status: 'not-found' }
    | { readonly status: 'conflict' }
}
