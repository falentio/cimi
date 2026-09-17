import { and, asc, count, desc, eq, exists, lte, notExists } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import { parse } from 'valibot'
import { toJsonObject, toJsonValue } from '../reporting/model.ts'
import type { GoalRepository } from './repository.ts'

export interface GoalRepositoryDrizzleDependencies {
  readonly db: Db
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export class GoalRepositoryDrizzle implements GoalRepository {
  constructor(private readonly deps: GoalRepositoryDrizzleDependencies) {}

  async findById(
    input: GoalRepository.IdentityInput | GoalRepository.UnscopedIdentityInput,
  ): Promise<GoalRepository.Goal | undefined> {
    const rows = await this.deps.db
      .select({ goal: schema.TGoal, version: schema.TGoalVersion })
      .from(schema.TGoal)
      .innerJoin(
        schema.TGoalVersion,
        and(
          eq(schema.TGoalVersion.goalId, schema.TGoal.id),
          eq(schema.TGoalVersion.version, schema.TGoal.currentVersion),
        ),
      )
      .where(
        and(
          eq(schema.TGoal.id, input.goalId),
          ...('siteId' in input ? [eq(schema.TGoal.siteId, input.siteId)] : []),
          liveSite(this.deps.db),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toGoal(row.goal, row.version)
  }

  async findVersionAt(
    input: GoalRepository.VersionInput,
  ): Promise<GoalRepository.Goal | undefined> {
    if ((await this.findById({ siteId: input.siteId, goalId: input.goalId })) === undefined) {
      return undefined
    }
    const rows = await this.deps.db
      .select({ goal: schema.TGoal, version: schema.TGoalVersion })
      .from(schema.TGoal)
      .innerJoin(
        schema.TGoalVersion,
        and(
          eq(schema.TGoalVersion.goalId, schema.TGoal.id),
          lte(schema.TGoalVersion.effectiveAt, input.at),
        ),
      )
      .where(
        and(
          eq(schema.TGoal.id, input.goalId),
          eq(schema.TGoal.siteId, input.siteId),
          liveSite(this.deps.db),
        ),
      )
      .orderBy(desc(schema.TGoalVersion.effectiveAt), desc(schema.TGoalVersion.version))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toGoal(row.goal, row.version)
  }

  async findMany(input: GoalRepository.ListInput): Promise<GoalRepository.ListResult> {
    const where = and(eq(schema.TGoal.siteId, input.siteId), liveSite(this.deps.db))
    const [countRow] = await this.deps.db
      .select({ count: count() })
      .from(schema.TGoal)
      .innerJoin(
        schema.TGoalVersion,
        and(
          eq(schema.TGoalVersion.goalId, schema.TGoal.id),
          eq(schema.TGoalVersion.version, schema.TGoal.currentVersion),
        ),
      )
      .where(where)
    const rows = await this.deps.db
      .select({ goal: schema.TGoal, version: schema.TGoalVersion })
      .from(schema.TGoal)
      .innerJoin(
        schema.TGoalVersion,
        and(
          eq(schema.TGoalVersion.goalId, schema.TGoal.id),
          eq(schema.TGoalVersion.version, schema.TGoal.currentVersion),
        ),
      )
      .where(where)
      .orderBy(asc(schema.TGoal.createdAt), asc(schema.TGoal.id))
      .limit(input.limit + 1)
      .offset(input.offset)
    const hasMore = rows.length > input.limit
    return {
      items: rows.slice(0, input.limit).map((row) => toGoal(row.goal, row.version)),
      nextOffset: hasMore ? input.offset + input.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async insert(input: GoalRepository.InsertInput): Promise<GoalRepository.Goal> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      tx.insert(schema.TGoal)
        .values({
          id: input.id,
          siteId: input.siteId,
          name: input.name,
          actionJson: toJsonObject(input.action),
          propertyFiltersJson:
            input.propertyFilters === undefined ? null : toJsonValue(input.propertyFilters),
          identityKind: input.identityKind,
          status: 'active',
          currentVersion: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run()
      tx.insert(schema.TGoalVersion)
        .values({
          id: `${input.id}:v1`,
          goalId: input.id,
          version: 1,
          name: input.name,
          actionJson: toJsonObject(input.action),
          propertyFiltersJson:
            input.propertyFilters === undefined ? null : toJsonValue(input.propertyFilters),
          identityKind: input.identityKind,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      const row = selectCurrent(tx, input.siteId, input.id)
      if (row === undefined) throw new Error('Goal insert returned no row')
      return toGoal(row.goal, row.version)
    })
  }

  async update(input: GoalRepository.UpdateInput): Promise<GoalRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.goalId)
      if (current === undefined) {
        return rawExists(tx, schema.TGoal, input.siteId, input.goalId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.goal.status !== 'active') return { status: 'conflict' }
      const version = current.goal.currentVersion + 1
      tx.insert(schema.TGoalVersion)
        .values({
          id: `${input.goalId}:v${version}`,
          goalId: input.goalId,
          version,
          name: input.name,
          actionJson: toJsonObject(input.action),
          propertyFiltersJson:
            input.propertyFilters === undefined ? null : toJsonValue(input.propertyFilters),
          identityKind: input.identityKind,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      tx.update(schema.TGoal)
        .set({
          name: input.name,
          actionJson: toJsonObject(input.action),
          propertyFiltersJson:
            input.propertyFilters === undefined ? null : toJsonValue(input.propertyFilters),
          identityKind: input.identityKind,
          currentVersion: version,
          updatedAt: input.now,
        })
        .where(and(eq(schema.TGoal.id, input.goalId), eq(schema.TGoal.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.goalId)
      if (row === undefined) throw new Error('Goal update returned no row')
      return { status: 'updated', goal: toGoal(row.goal, row.version) }
    })
  }

  async archive(input: GoalRepository.ArchiveInput): Promise<GoalRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.goalId)
      if (current === undefined) {
        return rawExists(tx, schema.TGoal, input.siteId, input.goalId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.goal.status !== 'active') return { status: 'conflict' }
      tx.update(schema.TGoal)
        .set({ status: 'archived', updatedAt: input.now })
        .where(and(eq(schema.TGoal.id, input.goalId), eq(schema.TGoal.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.goalId)
      if (row === undefined) throw new Error('Goal archive returned no row')
      return { status: 'updated', goal: toGoal(row.goal, row.version) }
    })
  }
}

function liveSite(db: Db | SqliteTransaction) {
  return and(
    exists(
      db
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(and(eq(schema.TSite.id, schema.TGoal.siteId), eq(schema.TSite.status, 'active'))),
    ),
    notExists(
      db
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(eq(schema.TSiteTombstone.siteId, schema.TGoal.siteId)),
    ),
  )
}

function assertActiveSite(tx: SqliteTransaction, siteId: string): void {
  const rows = tx
    .select({ id: schema.TSite.id })
    .from(schema.TSite)
    .where(
      and(
        eq(schema.TSite.id, siteId),
        eq(schema.TSite.status, 'active'),
        notExists(
          tx
            .select({ siteId: schema.TSiteTombstone.siteId })
            .from(schema.TSiteTombstone)
            .where(eq(schema.TSiteTombstone.siteId, schema.TSite.id)),
        ),
      ),
    )
    .limit(1)
    .all()
  if (rows.length === 0) throw new ORPCError('NOT_FOUND')
}

function selectCurrent(tx: SqliteTransaction, siteId: string, goalId: string) {
  return tx
    .select({ goal: schema.TGoal, version: schema.TGoalVersion })
    .from(schema.TGoal)
    .innerJoin(
      schema.TGoalVersion,
      and(
        eq(schema.TGoalVersion.goalId, schema.TGoal.id),
        eq(schema.TGoalVersion.version, schema.TGoal.currentVersion),
      ),
    )
    .where(and(eq(schema.TGoal.siteId, siteId), eq(schema.TGoal.id, goalId)))
    .limit(1)
    .all()[0]
}

function rawExists(
  tx: SqliteTransaction,
  table: typeof schema.TGoal,
  siteId: string,
  goalId: string,
): boolean {
  return (
    tx
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.siteId, siteId), eq(table.id, goalId)))
      .limit(1)
      .all().length > 0
  )
}

function toGoal(
  row: typeof schema.TGoal.$inferSelect,
  version: typeof schema.TGoalVersion.$inferSelect,
): GoalRepository.Goal {
  const definition = parse(contractSchema.SGoalDefinitionFields, {
    name: version.name,
    action: version.actionJson,
    ...(version.propertyFiltersJson === null
      ? {}
      : { propertyFilters: version.propertyFiltersJson }),
    identityKind: version.identityKind,
  })
  return {
    id: row.id,
    siteId: row.siteId,
    ...definition,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
