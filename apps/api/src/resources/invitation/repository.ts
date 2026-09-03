import type { schema } from '@cimi/contract'
import type { InferOutput } from 'valibot'
import type { TokenHash } from './token.ts'

export interface InvitationRepository {
  findById(id: string): Promise<InvitationRepository.InvitationRecord | undefined>
  findByTokenHash(tokenHash: TokenHash): Promise<InvitationRepository.InvitationRecord | undefined>
  findMany(
    organizationId: string,
    options: InvitationRepository.FindManyOptions,
  ): Promise<InvitationRepository.FindManyResult>
  findAuthorityOrganizationId(organizationId: string): Promise<string | undefined>
  insert(input: InvitationRepository.CreateInput): Promise<InvitationRepository.InvitationRecord>
  consume(input: InvitationRepository.ConsumeInput): Promise<InvitationRepository.ConsumeResult>
  revoke(input: InvitationRepository.RevokeInput): Promise<InvitationRepository.RevokeResult>
}

export declare namespace InvitationRepository {
  export type InvitationStatus = InferOutput<typeof schema.SInvitationStatus>
  export type InvitationRole = InferOutput<typeof schema.SInvitationRole>
  export type FindManyResult = InferOutput<typeof schema.SInvitationListOutput>

  export interface InvitationRecord {
    id: string
    organizationId: string
    role: InvitationRole
    tokenHash: TokenHash
    expiresAt: Date
    status: InvitationStatus
    acceptedAt: Date | null
    revokedAt: Date | null
    createdAt: Date
    updatedAt: Date
  }

  export interface MembershipRecord {
    organizationId: string
    userId: string
    role: InvitationRole
    createdAt: Date
    updatedAt: Date
  }

  export interface FindManyOptions {
    offset: number
    limit: number
  }

  export interface CreateInput {
    id: string
    organizationId: string
    role: InvitationRole
    tokenHash: TokenHash
    expiresAt: Date
    createdAt: Date
    updatedAt: Date
  }

  export interface ConsumeInput {
    tokenHash: TokenHash
    userId: string
    now: Date
  }

  export type ConsumeResult =
    | { status: 'consumed'; invitation: InvitationRecord; membership: MembershipRecord }
    | { status: 'not-found' }
    | { status: 'expired' }
    | { status: 'conflict'; currentRole: 'owner' | InvitationRole }

  export interface RevokeInput {
    invitationId: string
    now: Date
  }

  export type RevokeResult =
    | { status: 'revoked' }
    | { status: 'not-found' }
    | { status: 'consumed' }
    | { status: 'idempotent' }
}
