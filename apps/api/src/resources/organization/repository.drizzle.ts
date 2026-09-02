import { and, count, desc, eq, sql } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { OrganizationRecord, OrganizationRepository } from './repository.ts'
import { isOwnerInvariantValid } from './owner-invariant.ts'

export interface OrganizationRepositoryDrizzleDependencies {
  readonly db: Db
}

export class OrganizationRepositoryDrizzle implements OrganizationRepository {
  private readonly db: Db

  constructor({ db }: OrganizationRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findManyForUser(options: {
    userId: string
    offset: number
    limit: number
  }): Promise<OrganizationRepository.Page> {
    const membership = schema.TMembership
    const organization = schema.TOrganization
    const where = eq(membership.userId, options.userId)
    const [countRow] = await this.db
      .select({ count: count() })
      .from(organization)
      .innerJoin(membership, eq(membership.organizationId, organization.id))
      .where(where)
    const rows = await this.db
      .select({ organization })
      .from(organization)
      .innerJoin(membership, eq(membership.organizationId, organization.id))
      .where(where)
      .orderBy(desc(organization.createdAt), desc(organization.id))
      .limit(options.limit + 1)
      .offset(options.offset)
    const hasMore = rows.length > options.limit
    return {
      items: rows.slice(0, options.limit).map((row) => toOrganization(row.organization)),
      nextOffset: hasMore ? options.offset + options.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async findById(id: string): Promise<OrganizationRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, id))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toOrganization(row)
  }

  async findByAuthorityId(
    authorityOrganizationId: string,
  ): Promise<OrganizationRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.authorityOrganizationId, authorityOrganizationId))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toOrganization(row)
  }

  async findByIdForUser(id: string, userId: string): Promise<OrganizationRecord | undefined> {
    const rows = await this.db
      .select({ organization: schema.TOrganization })
      .from(schema.TOrganization)
      .innerJoin(
        schema.TMembership,
        and(
          eq(schema.TMembership.organizationId, schema.TOrganization.id),
          eq(schema.TMembership.userId, userId),
        ),
      )
      .where(eq(schema.TOrganization.id, id))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toOrganization(row.organization)
  }

  async findPersonalByOwner(ownerUserId: string): Promise<OrganizationRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganization)
      .where(
        and(
          eq(schema.TOrganization.ownerUserId, ownerUserId),
          eq(schema.TOrganization.isPersonal, true),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toOrganization(row)
  }

  async findRoleForUser(organizationId: string, userId: string) {
    const rows = await this.db
      .select({ role: schema.TMembership.role })
      .from(schema.TMembership)
      .where(
        and(
          eq(schema.TMembership.organizationId, organizationId),
          eq(schema.TMembership.userId, userId),
        ),
      )
      .limit(1)
    return rows[0]?.role
  }

  async isOwnerInvariantValid(organizationId: string): Promise<boolean> {
    return isOwnerInvariantValid(this.db, organizationId)
  }

  async insert(input: OrganizationRepository.InsertInput): Promise<OrganizationRecord> {
    const rows = await this.db.insert(schema.TOrganization).values(input).returning()
    const row = rows[0]
    if (row === undefined) throw new Error('Organization insert returned no row')
    return toOrganization(row)
  }

  async insertWithOwner(
    input: OrganizationRepository.InsertInput,
    membership: { readonly userId: string; readonly now: Date },
  ): Promise<OrganizationRecord> {
    return this.db.transaction((tx) => {
      const organizations = tx.insert(schema.TOrganization).values(input).returning().all()
      const organization = organizations[0]
      if (organization === undefined) throw new Error('Organization insert returned no row')
      tx.insert(schema.TMembership)
        .values({
          organizationId: organization.id,
          userId: membership.userId,
          role: 'owner',
          createdAt: membership.now,
          updatedAt: membership.now,
        })
        .run()
      return toOrganization(organization)
    })
  }

  async updateName(id: string, name: string): Promise<OrganizationRecord | undefined> {
    const rows = await this.db
      .update(schema.TOrganization)
      .set({ name, updatedAt: new Date() })
      .where(eq(schema.TOrganization.id, id))
      .returning()
    const row = rows[0]
    return row === undefined ? undefined : toOrganization(row)
  }

  async checkDelete(id: string): Promise<OrganizationRepository.DeleteResult> {
    const organizations = await this.db
      .select({ isPersonal: schema.TOrganization.isPersonal })
      .from(schema.TOrganization)
      .where(eq(schema.TOrganization.id, id))
      .limit(1)
    const organization = organizations[0]
    if (organization === undefined) return { kind: 'missing' }

    const sites = await this.db
      .select({ id: schema.TSite.id })
      .from(schema.TSite)
      .where(eq(schema.TSite.organizationId, id))
      .limit(1)
    if (sites.length > 0) return { kind: 'not-empty', isPersonal: organization.isPersonal }
    return { kind: 'deletable', isPersonal: organization.isPersonal }
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(schema.TOrganization)
      .where(eq(schema.TOrganization.id, id))
      .returning({ id: schema.TOrganization.id })
    return rows.length > 0
  }

  async deleteIfEmpty(id: string): Promise<OrganizationRepository.DeleteResult> {
    return this.db.transaction((tx) => {
      const organizations = tx
        .select({ isPersonal: schema.TOrganization.isPersonal })
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, id))
        .limit(1)
        .all()
      const organization = organizations[0]
      if (organization === undefined) return { kind: 'missing' }

      const sites = tx
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(eq(schema.TSite.organizationId, id))
        .limit(1)
        .all()
      if (sites.length > 0) return { kind: 'not-empty', isPersonal: organization.isPersonal }

      tx.delete(schema.TOrganization).where(eq(schema.TOrganization.id, id)).run()
      return { kind: 'deleted' }
    })
  }

  async createDeleteOperation(
    input: OrganizationRepository.CreateDeleteOperationInput,
  ): Promise<OrganizationRepository.DeleteOperation> {
    return this.db.transaction((tx) => {
      const organization = tx
        .select()
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, input.organizationId))
        .limit(1)
        .all()[0]
      if (organization === undefined) throw new Error('NOT_FOUND')

      const sites = tx
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(eq(schema.TSite.organizationId, input.organizationId))
        .limit(1)
        .all()
      if (sites.length > 0) {
        throw new Error(organization.isPersonal ? 'PERSONAL_PROTECTED' : 'ORGANIZATION_NOT_EMPTY')
      }

      const pending = tx
        .select({ id: schema.TOrganizationGovernanceOperation.id })
        .from(schema.TOrganizationGovernanceOperation)
        .where(
          and(
            eq(schema.TOrganizationGovernanceOperation.organizationId, input.organizationId),
            eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          ),
        )
        .limit(1)
        .all()
      if (pending.length > 0) throw new Error('FENCED_PENDING')
      if (organization.ownerUserId !== input.previousOwnerUserId) {
        throw new Error('FORBIDDEN_OWNER')
      }

      const owners = tx
        .select({ userId: schema.TMembership.userId })
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, input.organizationId),
            eq(schema.TMembership.role, 'owner'),
          ),
        )
        .all()
      if (owners.length !== 1 || owners[0]?.userId !== organization.ownerUserId) {
        throw new Error('CONFLICT_OWNER')
      }

      const rows = tx
        .insert(schema.TOrganizationGovernanceOperation)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          operationType: 'delete-organization',
          previousOwnerUserId: input.previousOwnerUserId,
          targetUserId: input.targetUserId,
          targetRole: null,
          status: 'pending',
          attemptCount: 0,
          requestedAt: input.requestedAt,
          lastAttemptAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .returning()
        .all()
      const row = rows[0]
      if (row === undefined) throw new Error('DELETE_OPERATION_INSERT_FAILED')
      return toDeleteOperation(row)
    })
  }

  async findPendingDeleteOperation(
    organizationId: string,
  ): Promise<OrganizationRepository.DeleteOperation | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TOrganizationGovernanceOperation)
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
          eq(schema.TOrganizationGovernanceOperation.operationType, 'delete-organization'),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toDeleteOperation(row)
  }

  async incrementDeleteAttempt(operationId: string): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({
        attemptCount: sql`${schema.TOrganizationGovernanceOperation.attemptCount} + 1`,
        lastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, operationId),
          eq(schema.TOrganizationGovernanceOperation.operationType, 'delete-organization'),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
  }

  async recordDeleteFailure(operationId: string, failureMessage: string): Promise<void> {
    await this.db
      .update(schema.TOrganizationGovernanceOperation)
      .set({ failureCode: 'CONFLICT', failureMessage, updatedAt: new Date() })
      .where(
        and(
          eq(schema.TOrganizationGovernanceOperation.id, operationId),
          eq(schema.TOrganizationGovernanceOperation.operationType, 'delete-organization'),
          eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
        ),
      )
  }

  async finalizeDeleteOperation(operationId: string): Promise<boolean> {
    return this.db.transaction((tx) => {
      const operation = tx
        .select()
        .from(schema.TOrganizationGovernanceOperation)
        .where(
          and(
            eq(schema.TOrganizationGovernanceOperation.id, operationId),
            eq(schema.TOrganizationGovernanceOperation.operationType, 'delete-organization'),
            eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
          ),
        )
        .limit(1)
        .all()[0]
      if (operation === undefined) throw new Error('PENDING_NOT_FOUND')

      const organization = tx
        .select()
        .from(schema.TOrganization)
        .where(eq(schema.TOrganization.id, operation.organizationId))
        .limit(1)
        .all()[0]
      if (organization === undefined) throw new Error('ORG_NOT_FOUND')

      const sites = tx
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(eq(schema.TSite.organizationId, operation.organizationId))
        .limit(1)
        .all()
      if (sites.length > 0) {
        throw new Error(organization.isPersonal ? 'PERSONAL_PROTECTED' : 'ORGANIZATION_NOT_EMPTY')
      }

      const owners = tx
        .select({ userId: schema.TMembership.userId })
        .from(schema.TMembership)
        .where(
          and(
            eq(schema.TMembership.organizationId, operation.organizationId),
            eq(schema.TMembership.role, 'owner'),
          ),
        )
        .all()
      if (
        operation.previousOwnerUserId !== organization.ownerUserId ||
        owners.length !== 1 ||
        owners[0]?.userId !== organization.ownerUserId
      ) {
        throw new Error('CONFLICT_OWNER')
      }

      const result = tx
        .delete(schema.TOrganization)
        .where(eq(schema.TOrganization.id, operation.organizationId))
        .returning({ id: schema.TOrganization.id })
        .all()
      return result.length > 0
    })
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
}

function toDeleteOperation(
  row: typeof schema.TOrganizationGovernanceOperation.$inferSelect,
): OrganizationRepository.DeleteOperation {
  if (row.operationType !== 'delete-organization') {
    throw new Error(`Unsupported organization operation type: ${row.operationType}`)
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    previousOwnerUserId: row.previousOwnerUserId,
    targetUserId: row.targetUserId,
    attemptCount: row.attemptCount,
  }
}

function toOrganization(row: typeof schema.TOrganization.$inferSelect): OrganizationRecord {
  return {
    id: row.id,
    name: row.name,
    authorityOrganizationId: row.authorityOrganizationId,
    ownerUserId: row.ownerUserId,
    isPersonal: row.isPersonal,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
