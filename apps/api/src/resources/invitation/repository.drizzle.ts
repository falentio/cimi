import { and, asc, count, eq } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { InvitationRepository } from './repository.ts'
import type { TokenHash } from './token.ts'

export interface InvitationRepositoryDrizzleDependencies {
  db: Db
}

export class InvitationRepositoryDrizzle implements InvitationRepository {
  private readonly db: Db

  constructor({ db }: InvitationRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findById(id: string): Promise<InvitationRepository.InvitationRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TInvitation)
      .where(eq(schema.TInvitation.id, id))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toRecord(row)
  }

  async findByTokenHash(
    tokenHash: TokenHash,
  ): Promise<InvitationRepository.InvitationRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TInvitation)
      .where(eq(schema.TInvitation.tokenHash, tokenHash))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toRecord(row)
  }

  async findMany(
    organizationId: string,
    options: InvitationRepository.FindManyOptions,
  ): Promise<InvitationRepository.FindManyResult> {
    const where = eq(schema.TInvitation.organizationId, organizationId)
    const [countRow] = await this.db
      .select({ count: count() })
      .from(schema.TInvitation)
      .where(where)
    const rows = await this.db
      .select()
      .from(schema.TInvitation)
      .where(where)
      .orderBy(asc(schema.TInvitation.createdAt), asc(schema.TInvitation.id))
      .limit(options.limit + 1)
      .offset(options.offset)
    const hasMore = rows.length > options.limit
    return {
      items: rows.slice(0, options.limit).map((row) => toPublic(row, new Date())),
      nextOffset: hasMore ? options.offset + options.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async findAuthorityOrganizationId(organizationId: string): Promise<string | undefined> {
    const rows = await this.db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organizationId))
      .limit(1)
    return rows[0]?.authorityOrganizationId ?? undefined
  }

  async insert(
    input: InvitationRepository.CreateInput,
  ): Promise<InvitationRepository.InvitationRecord> {
    const rows = await this.db
      .insert(schema.TInvitation)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        status: 'pending',
        acceptedAt: null,
        revokedAt: null,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      })
      .returning()
    const row = rows[0]
    if (row === undefined) throw new Error('Invitation insert returned no row')
    return toRecord(row)
  }

  async consume(
    input: InvitationRepository.ConsumeInput,
  ): Promise<InvitationRepository.ConsumeResult> {
    return this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(schema.TInvitation)
        .where(eq(schema.TInvitation.tokenHash, input.tokenHash))
        .limit(1)
        .all()[0]
      if (row === undefined) return { status: 'not-found' }
      if (row.status === 'expired') return { status: 'expired' }
      if (row.status !== 'pending') return { status: 'not-found' }
      if (row.expiresAt <= input.now) {
        tx.update(schema.TInvitation)
          .set({ status: 'expired', updatedAt: input.now })
          .where(and(eq(schema.TInvitation.id, row.id), eq(schema.TInvitation.status, 'pending')))
          .run()
        return { status: 'expired' }
      }

      const existing = tx
        .select()
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, row.organizationId),
            eq(schema.TMembership.userId, input.userId),
          ),
        )
        .limit(1)
        .all()[0]
      if (existing !== undefined && existing.role !== row.role) {
        return { status: 'conflict', currentRole: existing.role }
      }

      const updated = tx
        .update(schema.TInvitation)
        .set({ status: 'accepted', acceptedAt: input.now, updatedAt: input.now })
        .where(and(eq(schema.TInvitation.id, row.id), eq(schema.TInvitation.status, 'pending')))
        .run()
      if (updated.changes !== 1) return { status: 'not-found' }

      if (existing !== undefined) {
        return {
          status: 'consumed',
          invitation: toRecord({
            ...row,
            status: 'accepted',
            acceptedAt: input.now,
            updatedAt: input.now,
          }),
          membership: toMembership(existing),
        }
      }

      tx.insert(schema.TMembership)
        .values({
          organizationId: row.organizationId,
          userId: input.userId,
          role: row.role,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoNothing()
        .run()
      const inserted = tx
        .select()
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, row.organizationId),
            eq(schema.TMembership.userId, input.userId),
          ),
        )
        .limit(1)
        .all()[0]
      if (inserted === undefined) throw new Error('Invitation membership insert returned no row')
      if (inserted.role !== row.role) {
        tx.update(schema.TInvitation)
          .set({ status: 'pending', acceptedAt: null, updatedAt: input.now })
          .where(and(eq(schema.TInvitation.id, row.id), eq(schema.TInvitation.status, 'accepted')))
          .run()
        return { status: 'conflict', currentRole: inserted.role }
      }
      return {
        status: 'consumed',
        invitation: toRecord({
          ...row,
          status: 'accepted',
          acceptedAt: input.now,
          updatedAt: input.now,
        }),
        membership: toMembership(inserted),
      }
    })
  }

  async revoke(
    input: InvitationRepository.RevokeInput,
  ): Promise<InvitationRepository.RevokeResult> {
    return this.db.transaction((tx) => {
      const row = tx
        .select()
        .from(schema.TInvitation)
        .where(eq(schema.TInvitation.id, input.invitationId))
        .limit(1)
        .all()[0]
      if (row === undefined) return { status: 'not-found' }
      if (row.status === 'accepted') return { status: 'consumed' }
      if (row.status === 'revoked' || row.status === 'expired') return { status: 'idempotent' }
      if (row.expiresAt <= input.now) {
        tx.update(schema.TInvitation)
          .set({ status: 'expired', updatedAt: input.now })
          .where(and(eq(schema.TInvitation.id, row.id), eq(schema.TInvitation.status, 'pending')))
          .run()
        return { status: 'idempotent' }
      }
      const updated = tx
        .update(schema.TInvitation)
        .set({ status: 'revoked', revokedAt: input.now, updatedAt: input.now })
        .where(and(eq(schema.TInvitation.id, row.id), eq(schema.TInvitation.status, 'pending')))
        .run()
      if (updated.changes !== 1) {
        const current = tx
          .select()
          .from(schema.TInvitation)
          .where(eq(schema.TInvitation.id, row.id))
          .limit(1)
          .all()[0]
        if (current?.status === 'accepted') return { status: 'consumed' }
        if (current?.status === 'revoked' || current?.status === 'expired')
          return { status: 'idempotent' }
        return { status: 'not-found' }
      }
      return { status: 'revoked' }
    })
  }
}

function toRecord(
  row: typeof schema.TInvitation.$inferSelect,
): InvitationRepository.InvitationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    role: row.role,
    tokenHash: row.tokenHash as TokenHash,
    expiresAt: row.expiresAt,
    status: row.status,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toPublic(
  row: typeof schema.TInvitation.$inferSelect,
  now: Date,
): InvitationRepository.FindManyResult['items'][number] {
  const status = row.status === 'pending' && row.expiresAt <= now ? 'expired' : row.status
  return {
    id: row.id,
    organizationId: row.organizationId,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toMembership(
  row: typeof schema.TMembership.$inferSelect,
): InvitationRepository.MembershipRecord {
  if (row.role === 'owner') throw new Error('Invitation membership must not be an owner')
  return {
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
