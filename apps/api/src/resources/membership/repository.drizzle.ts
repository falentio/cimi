import { and, count, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { OrganizationRole } from '../organization/repository.ts'
import { isOwnerInvariantValid } from '../organization/owner-invariant.ts'
import type { MembershipRecord, MembershipRepository } from './repository.ts'

export interface MembershipRepositoryDrizzleDependencies {
  readonly db: Db
}

export class MembershipRepositoryDrizzle implements MembershipRepository {
  private readonly db: Db

  constructor({ db }: MembershipRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findMany(options: {
    organizationId: string
    offset: number
    limit: number
  }): Promise<MembershipRepository.Page> {
    const where = eq(schema.TMembership.organizationId, options.organizationId)
    const [countRow] = await this.db
      .select({ count: count() })
      .from(schema.TMembership)
      .where(where)
    const rows = await this.db
      .select()
      .from(schema.TMembership)
      .where(where)
      .orderBy(desc(schema.TMembership.createdAt), desc(schema.TMembership.userId))
      .limit(options.limit + 1)
      .offset(options.offset)
    const hasMore = rows.length > options.limit
    return {
      items: rows.slice(0, options.limit).map(toMembership),
      nextOffset: hasMore ? options.offset + options.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async findAll(organizationId: string): Promise<MembershipRecord[]> {
    const rows = await this.db
      .select()
      .from(schema.TMembership)
      .where(eq(schema.TMembership.organizationId, organizationId))
    return rows.map(toMembership)
  }

  async findByUser(options: {
    organizationId: string
    userId: string
  }): Promise<MembershipRecord | undefined> {
    return this.findById(options)
  }

  async findById(options: {
    organizationId: string
    userId: string
  }): Promise<MembershipRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TMembership)
      .where(
        and(
          eq(schema.TMembership.organizationId, options.organizationId),
          eq(schema.TMembership.userId, options.userId),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toMembership(row)
  }

  async findOwner(organizationId: string): Promise<MembershipRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TMembership)
      .where(
        and(
          eq(schema.TMembership.organizationId, organizationId),
          eq(schema.TMembership.role, 'owner'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toMembership(row)
  }

  async findAuthorityOrganizationId(organizationId: string): Promise<string | undefined> {
    const rows = await this.db
      .select({ authorityOrganizationId: schema.TOrganization.authorityOrganizationId })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, organizationId))
      .limit(1)
    return rows[0]?.authorityOrganizationId ?? undefined
  }

  async isOwnerInvariantValid(organizationId: string): Promise<boolean> {
    return isOwnerInvariantValid(this.db, organizationId)
  }

  async hasPendingGovernanceOperation(organizationId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: schema.TOrganizationGovernanceOperation.id })
      .from(schema.TOrganizationGovernanceOperation)
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
      .limit(1)
    return rows.length > 0
  }

  async replaceMembers(organizationId: string, members: MembershipRecord[]): Promise<void> {
    return this.db.transaction((tx) => {
      const pending = tx
        .select({ id: schema.TOrganizationGovernanceOperation.id })
        .from(schema.TOrganizationGovernanceOperation)
        .where(
          and(
            eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
            eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          ),
        )
        .limit(1)
        .all()
      if (pending.length > 0) throw new Error('Membership reconciliation is fenced')

      const organizations = tx
        .select({ ownerUserId: schema.TOrganization.ownerUserId })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, organizationId))
        .limit(1)
        .all()
      const organization = organizations[0]
      const owners = members.filter((member) => member.role === 'owner')
      if (
        organization === undefined ||
        owners.length !== 1 ||
        owners[0]?.userId !== organization.ownerUserId ||
        new Set(members.map((member) => member.userId)).size !== members.length
      ) {
        throw new Error('Membership reconciliation owner state is invalid')
      }

      const existing = tx
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, organizationId))
        .all()
      const existingOwner = existing.find((member) => member.role === 'owner')
      if (existingOwner !== undefined && existingOwner.userId !== owners[0]?.userId) {
        tx.update(schema.TMembership)
          .set({ role: 'admin', updatedAt: owners[0]?.updatedAt ?? existingOwner.updatedAt })
          .where(
            and(
              eq(schema.TMembership.organizationId, organizationId),
              eq(schema.TMembership.userId, existingOwner.userId),
              eq(schema.TMembership.role, 'owner'),
            ),
          )
          .run()
      }

      for (const member of members) {
        tx.insert(schema.TMembership)
          .values({
            organizationId,
            userId: member.userId,
            role: member.role,
            createdAt: member.createdAt,
            updatedAt: member.updatedAt,
          })
          .onConflictDoUpdate({
            target: [schema.TMembership.organizationId, schema.TMembership.userId],
            set: { role: member.role, updatedAt: member.updatedAt },
          })
          .run()
      }

      const keep = new Set(members.map((member) => member.userId))
      for (const member of existing) {
        if (keep.has(member.userId)) continue
        tx.delete(schema.TMembership)
          .where(
            and(
              eq(schema.TMembership.organizationId, organizationId),
              eq(schema.TMembership.userId, member.userId),
            ),
          )
          .run()
      }
    })
  }

  async updateRole(options: {
    organizationId: string
    userId: string
    role: OrganizationRole
    updatedAt: Date
  }): Promise<MembershipRecord | undefined> {
    const rows = await this.db
      .update(schema.TMembership)
      .set({ role: options.role, updatedAt: options.updatedAt })
      .where(
        and(
          eq(schema.TMembership.organizationId, options.organizationId),
          eq(schema.TMembership.userId, options.userId),
          ne(schema.TMembership.role, 'owner'),
        ),
      )
      .returning()
    const row = rows[0]
    return row === undefined ? undefined : toMembership(row)
  }

  async delete(options: { organizationId: string; userId: string }): Promise<boolean> {
    const rows = await this.db
      .delete(schema.TMembership)
      .where(
        and(
          eq(schema.TMembership.organizationId, options.organizationId),
          eq(schema.TMembership.userId, options.userId),
          ne(schema.TMembership.role, 'owner'),
        ),
      )
      .returning({ userId: schema.TMembership.userId })
    return rows.length > 0
  }

  async createTransfer(options: {
    id: string
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    now: Date
  }): Promise<MembershipRepository.TransferAdmission> {
    return this.db.transaction((tx) => {
      const pending = tx
        .select()
        .from(schema.TOrganizationGovernanceOperation)
        .where(
          and(
            eq(schema.TOrganizationGovernanceOperation.organizationId, options.organizationId),
            eq(schema.TOrganizationGovernanceOperation.operationType, 'transfer-ownership'),
            eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          ),
        )
        .limit(1)
        .all()[0]
      if (pending !== undefined) return { kind: 'already-pending', transfer: toTransfer(pending) }

      const organization = tx
        .select()
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, options.organizationId))
        .limit(1)
        .all()[0]
      if (organization === undefined || organization.ownerUserId !== options.previousOwnerUserId) {
        return { kind: 'invalid' }
      }

      const memberships = tx
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, options.organizationId))
        .all()
      const owners = memberships.filter((membership) => membership.role === 'owner')
      const previousOwner = memberships.find(
        (membership) => membership.userId === options.previousOwnerUserId,
      )
      const target = memberships.find((membership) => membership.userId === options.targetUserId)
      if (
        owners.length !== 1 ||
        previousOwner?.role !== 'owner' ||
        target === undefined ||
        target.role === 'owner'
      ) {
        return { kind: 'invalid' }
      }

      const row = tx
        .insert(schema.TOrganizationGovernanceOperation)
        .values({
          id: options.id,
          organizationId: options.organizationId,
          operationType: 'transfer-ownership',
          previousOwnerUserId: options.previousOwnerUserId,
          targetUserId: options.targetUserId,
          status: 'pending',
          attemptCount: 0,
          requestedAt: options.now,
          lastAttemptAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          createdAt: options.now,
          updatedAt: options.now,
        })
        .returning()
        .all()[0]
      if (row === undefined) throw new Error('Governance operation insert returned no row')
      return { kind: 'admitted', transfer: toTransfer(row) }
    })
  }

  async findPendingTransfer(
    organizationId: string,
  ): Promise<MembershipRepository.Transfer | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganizationGovernanceOperation)
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
          eq(schema.TOrganizationGovernanceOperation.operationType, 'transfer-ownership'),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toTransfer(row)
  }

  async findCompletedTransfer(options: {
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
  }): Promise<MembershipRecord | undefined> {
    const operations = await this.db
      .select({ targetUserId: schema.TOrganizationGovernanceOperation.targetUserId })
      .from(schema.TOrganizationGovernanceOperation)
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.organizationId, options.organizationId),
          eq(schema.TOrganizationGovernanceOperation.operationType, 'transfer-ownership'),
          eq(
            schema.TOrganizationGovernanceOperation.previousOwnerUserId,
            options.previousOwnerUserId,
          ),
          eq(schema.TOrganizationGovernanceOperation.targetUserId, options.targetUserId),
          eq(schema.TOrganizationGovernanceOperation.status, 'completed'),
        ),
      )
      .orderBy(sql`${schema.TOrganizationGovernanceOperation.completedAt} DESC`)
      .limit(1)
    const operation = operations[0]
    if (operation === undefined) return undefined
    const members = await this.db
      .select()
      .from(schema.TMembership)
      .where(
        and(
          eq(schema.TMembership.organizationId, options.organizationId),
          eq(schema.TMembership.userId, operation.targetUserId),
          eq(schema.TMembership.role, 'owner'),
        ),
      )
      .limit(1)
    const member = members[0]
    if (member === undefined || !(await this.isOwnerInvariantValid(options.organizationId))) {
      return undefined
    }
    return toMembership(member)
  }

  async createMembershipOperation(
    options: MembershipRepository.CreateMembershipOperationInput,
  ): Promise<MembershipRepository.MembershipOperation> {
    return this.db.transaction((tx) => {
      const organization = tx
        .select({ ownerUserId: schema.TOrganization.ownerUserId })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, options.organizationId))
        .limit(1)
        .all()[0]
      const owners = tx
        .select({ userId: schema.TMembership.userId })
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, options.organizationId),
            eq(schema.TMembership.role, 'owner'),
          ),
        )
        .all()
      const target = tx
        .select({ role: schema.TMembership.role })
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, options.organizationId),
            eq(schema.TMembership.userId, options.targetUserId),
          ),
        )
        .limit(1)
        .all()[0]
      const targetRoleIsValid =
        options.operationType === 'change-member-role'
          ? options.targetRole !== null
          : options.targetRole === null
      if (
        organization === undefined ||
        owners.length !== 1 ||
        owners[0]?.userId !== organization.ownerUserId ||
        target === undefined ||
        target.role === 'owner' ||
        !targetRoleIsValid
      ) {
        throw new Error('Membership operation admission state is invalid')
      }

      const row = tx
        .insert(schema.TOrganizationGovernanceOperation)
        .values({
          id: options.id,
          organizationId: options.organizationId,
          operationType: options.operationType,
          previousOwnerUserId: organization.ownerUserId,
          targetUserId: options.targetUserId,
          targetRole: options.targetRole,
          status: 'pending',
          attemptCount: 0,
          requestedAt: options.now,
          lastAttemptAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          createdAt: options.now,
          updatedAt: options.now,
        })
        .returning()
        .all()[0]
      if (row === undefined) throw new Error('Membership operation insert returned no row')
      return toMembershipOperation(row)
    })
  }

  async findPendingMembershipOperation(
    organizationId: string,
  ): Promise<MembershipRepository.MembershipOperation | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganizationGovernanceOperation)
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
          inArray(schema.TOrganizationGovernanceOperation.operationType, [
            'change-member-role',
            'remove-member',
            'leave-organization',
          ]),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toMembershipOperation(row)
  }

  async incrementMembershipAttempt(id: string): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        attemptCount: sql`${schema.TOrganizationGovernanceOperation.attemptCount} + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, id),
          inArray(schema.TOrganizationGovernanceOperation.operationType, [
            'change-member-role',
            'remove-member',
            'leave-organization',
          ]),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
  }

  async completeMembershipOperation(id: string): Promise<void> {
    const result = await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        status: 'completed',
        completedAt: new Date(),
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, id),
          inArray(schema.TOrganizationGovernanceOperation.operationType, [
            'change-member-role',
            'remove-member',
            'leave-organization',
          ]),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
    if (result.changes > 0) return
    const rows = await this.db
      .select({ id: schema.TOrganizationGovernanceOperation.id })
      .from(schema.TOrganizationGovernanceOperation)
      .where(eq(schema.TOrganizationGovernanceOperation.id, id))
      .limit(1)
    if (rows.length === 0) throw new Error('Membership operation was not found')
  }

  async failMembershipOperation(options: {
    id: string
    failureCode: string
    failureMessage: string
  }): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        failureCode: options.failureCode,
        failureMessage: options.failureMessage,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, options.id),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          inArray(schema.TOrganizationGovernanceOperation.operationType, [
            'change-member-role',
            'remove-member',
            'leave-organization',
          ]),
        ),
      )
  }

  async markTransferAttempt(options: { id: string; now: Date }): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        attemptCount: sql`${schema.TOrganizationGovernanceOperation.attemptCount} + 1`,
        lastAttemptAt: options.now,
        updatedAt: options.now,
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, options.id),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
  }

  async completeTransfer(options: {
    id: string
    organizationId: string
    previousOwnerUserId: string
    targetUserId: string
    now: Date
  }): Promise<MembershipRecord> {
    return this.db.transaction((tx) => {
      const operation = tx
        .select()
        .from(schema.TOrganizationGovernanceOperation)
        .where(
          and(
            eq(schema.TOrganizationGovernanceOperation.id, options.id),
            eq(schema.TOrganizationGovernanceOperation.organizationId, options.organizationId),
            eq(schema.TOrganizationGovernanceOperation.operationType, 'transfer-ownership'),
            eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          ),
        )
        .limit(1)
        .all()[0]
      if (
        operation === undefined ||
        operation.previousOwnerUserId !== options.previousOwnerUserId ||
        operation.targetUserId !== options.targetUserId
      ) {
        throw new Error('Pending ownership transfer is no longer valid')
      }

      const memberships = tx
        .select()
        .from(schema.TMembership)
        .where(eq(schema.TMembership.organizationId, options.organizationId))
        .all()
      const owners = memberships.filter((membership) => membership.role === 'owner')
      const previousOwner = memberships.find(
        (membership) => membership.userId === options.previousOwnerUserId,
      )
      const target = memberships.find((membership) => membership.userId === options.targetUserId)
      if (
        owners.length !== 1 ||
        previousOwner?.role !== 'owner' ||
        target === undefined ||
        target.role === 'owner'
      ) {
        throw new Error('Cimi ownership invariant is not recoverable')
      }

      tx.update(schema.TMembership)
        .set({ role: 'admin', updatedAt: options.now })
        .where(
          and(
            eq(schema.TMembership.organizationId, options.organizationId),
            eq(schema.TMembership.userId, options.previousOwnerUserId),
            eq(schema.TMembership.role, 'owner'),
          ),
        )
        .run()
      const updatedTarget = tx
        .update(schema.TMembership)
        .set({ role: 'owner', updatedAt: options.now })
        .where(
          and(
            eq(schema.TMembership.organizationId, options.organizationId),
            eq(schema.TMembership.userId, options.targetUserId),
          ),
        )
        .returning()
        .all()[0]
      if (updatedTarget === undefined) throw new Error('Ownership target disappeared')

      tx.update(schema.TOrganization)
        .set({ ownerUserId: options.targetUserId, updatedAt: options.now })
        .where(eq(schema.TOrganization.id, options.organizationId))
        .run()
      tx.update(schema.TOrganizationGovernanceOperation)
        .set({ status: 'completed', completedAt: options.now, updatedAt: options.now })
        .where(eq(schema.TOrganizationGovernanceOperation.id, options.id))
        .run()

      const ownersAfter = tx
        .select({ userId: schema.TMembership.userId })
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, options.organizationId),
            eq(schema.TMembership.role, 'owner'),
          ),
        )
        .all()
      if (ownersAfter.length !== 1 || ownersAfter[0]?.userId !== options.targetUserId) {
        throw new Error('Ownership transfer did not produce exactly one owner')
      }
      return toMembership(updatedTarget)
    })
  }

  async failTransfer(options: {
    id: string
    now: Date
    failureCode: string
    failureMessage: string
  }): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        failureCode: options.failureCode,
        failureMessage: options.failureMessage,
        updatedAt: options.now,
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, options.id),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
  }
}

function toMembership(row: typeof schema.TMembership.$inferSelect): MembershipRecord {
  return {
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toTransfer(
  row: typeof schema.TOrganizationGovernanceOperation.$inferSelect,
): MembershipRepository.Transfer {
  if (row.operationType !== 'transfer-ownership') {
    throw new Error(`Unsupported transfer operation type: ${row.operationType}`)
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    previousOwnerUserId: row.previousOwnerUserId,
    targetUserId: row.targetUserId,
    attemptCount: row.attemptCount,
  }
}

function toMembershipOperation(
  row: typeof schema.TOrganizationGovernanceOperation.$inferSelect,
): MembershipRepository.MembershipOperation {
  if (
    row.operationType !== 'change-member-role' &&
    row.operationType !== 'remove-member' &&
    row.operationType !== 'leave-organization'
  ) {
    throw new Error(`Unsupported membership operation type: ${row.operationType}`)
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    operationType: row.operationType,
    targetUserId: row.targetUserId,
    targetRole: row.targetRole ?? null,
    attemptCount: row.attemptCount,
  }
}
