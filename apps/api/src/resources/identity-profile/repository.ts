import type {
  SDeletionStatusOutput,
  SIdentifyInput,
  SIdentifyOutput,
  SProfileGetOutput,
  SProfileListOutput,
  SRequestProfileDeletionOutput,
} from '@cimi/contract'
import type { InferOutput } from 'valibot'

export type IdentityProfile = SProfileGetOutput
export type IdentityProfileList = SProfileListOutput
export type IdentityDeletionStatus = SDeletionStatusOutput
export type ActiveIdentityProfile = Extract<IdentityProfile, { status: 'active' }>
export type IdentityProfileEpoch = ActiveIdentityProfile['identityHistory'][number]

export interface IdentityProfileRepository {
  identify(
    input: IdentityProfileRepository.IdentifyInput,
  ): Promise<IdentityProfileRepository.IdentifyResult>
  find(input: IdentityProfileRepository.FindInput): Promise<IdentityProfile | undefined>
  list(input: IdentityProfileRepository.ListInput): Promise<IdentityProfileList>
  getDeletionStatus(
    input: IdentityProfileRepository.FindInput,
  ): Promise<IdentityDeletionStatus | undefined>
  requestDeletion(
    input: IdentityProfileRepository.RequestDeletionInput,
  ): Promise<IdentityProfileRepository.RequestDeletionResult>
}

export declare namespace IdentityProfileRepository {
  export type IdentifyInput = {
    readonly siteId: string
    readonly identifiedUserId: string
    readonly traits: InferOutput<typeof SIdentifyInput>['traits']
    readonly anonymousIdentityId: string | undefined
    readonly now: Date
    readonly profileActivityCutoffAt?: Date | undefined
  }

  export type IdentifyResult =
    | { readonly kind: 'accepted'; readonly output: SIdentifyOutput }
    | { readonly kind: 'invalid' }
    | { readonly kind: 'payload-too-large' }
    | { readonly kind: 'conflict' }

  export interface FindInput {
    readonly siteId: string
    readonly identifiedUserId: string
    readonly profileActivityCutoffAt?: Date | undefined
  }

  export interface ListInput {
    readonly siteId: string
    readonly offset: number
    readonly limit: number
    readonly profileActivityCutoffAt?: Date | undefined
  }

  export interface RequestDeletionInput extends FindInput {
    readonly now: Date
  }

  export type RequestDeletionResult =
    | { readonly kind: 'accepted'; readonly output: SRequestProfileDeletionOutput }
    | { readonly kind: 'not-found' }
    | { readonly kind: 'conflict' }
}

export interface IdentityProfileIdFactory {
  identityProfileId(): string
  identityLinkId(): string
  identityRedactionId(): string
}
