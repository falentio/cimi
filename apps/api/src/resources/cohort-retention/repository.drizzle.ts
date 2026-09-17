import { and, asc, count, desc, eq, exists, lte, notExists } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import { parse } from 'valibot'
import { toJsonObject } from '../reporting/model.ts'
import type { CohortRepository } from './repository.ts'

export interface CohortRepositoryDrizzleDependencies {
  readonly db: Db
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export class CohortRepositoryDrizzle implements CohortRepository {
  constructor(private readonly deps: CohortRepositoryDrizzleDependencies) {}

  async findById(
    input: CohortRepository.IdentityInput | CohortRepository.UnscopedIdentityInput,
  ): Promise<CohortRepository.Cohort | undefined> {
    const rows = await this.deps.db
      .select({ cohort: schema.TCohort, version: schema.TCohortVersion })
      .from(schema.TCohort)
      .innerJoin(
        schema.TCohortVersion,
        and(
          eq(schema.TCohortVersion.cohortId, schema.TCohort.id),
          eq(schema.TCohortVersion.version, schema.TCohort.currentVersion),
        ),
      )
      .where(
        and(
          eq(schema.TCohort.id, input.cohortId),
          ...('siteId' in input ? [eq(schema.TCohort.siteId, input.siteId)] : []),
          liveSite(this.deps.db),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toCohort(row.cohort, row.version)
  }

  async findVersionAt(
    input: CohortRepository.VersionInput,
  ): Promise<CohortRepository.Cohort | undefined> {
    if ((await this.findById({ siteId: input.siteId, cohortId: input.cohortId })) === undefined) {
      return undefined
    }
    const rows = await this.deps.db
      .select({ cohort: schema.TCohort, version: schema.TCohortVersion })
      .from(schema.TCohort)
      .innerJoin(
        schema.TCohortVersion,
        and(
          eq(schema.TCohortVersion.cohortId, schema.TCohort.id),
          lte(schema.TCohortVersion.effectiveAt, input.at),
        ),
      )
      .where(
        and(
          eq(schema.TCohort.id, input.cohortId),
          eq(schema.TCohort.siteId, input.siteId),
          liveSite(this.deps.db),
        ),
      )
      .orderBy(desc(schema.TCohortVersion.effectiveAt), desc(schema.TCohortVersion.version))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toCohort(row.cohort, row.version)
  }

  async findMany(input: CohortRepository.ListInput): Promise<CohortRepository.ListResult> {
    const where = and(eq(schema.TCohort.siteId, input.siteId), liveSite(this.deps.db))
    const [countRow] = await this.deps.db
      .select({ count: count() })
      .from(schema.TCohort)
      .innerJoin(
        schema.TCohortVersion,
        and(
          eq(schema.TCohortVersion.cohortId, schema.TCohort.id),
          eq(schema.TCohortVersion.version, schema.TCohort.currentVersion),
        ),
      )
      .where(where)
    const rows = await this.deps.db
      .select({ cohort: schema.TCohort, version: schema.TCohortVersion })
      .from(schema.TCohort)
      .innerJoin(
        schema.TCohortVersion,
        and(
          eq(schema.TCohortVersion.cohortId, schema.TCohort.id),
          eq(schema.TCohortVersion.version, schema.TCohort.currentVersion),
        ),
      )
      .where(where)
      .orderBy(asc(schema.TCohort.createdAt), asc(schema.TCohort.id))
      .limit(input.limit + 1)
      .offset(input.offset)
    const hasMore = rows.length > input.limit
    return {
      items: rows.slice(0, input.limit).map((row) => toCohort(row.cohort, row.version)),
      nextOffset: hasMore ? input.offset + input.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async insert(input: CohortRepository.InsertInput): Promise<CohortRepository.Cohort> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      tx.insert(schema.TCohort)
        .values({
          id: input.id,
          siteId: input.siteId,
          name: input.name,
          identityKind: input.identityKind,
          period: input.period,
          status: 'active',
          currentVersion: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run()
      tx.insert(schema.TCohortVersion)
        .values({
          id: `${input.id}:v1`,
          cohortId: input.id,
          version: 1,
          name: input.name,
          entryActionJson: toJsonObject(input.entryAction),
          retentionActionJson: toJsonObject(input.retentionAction),
          identityKind: input.identityKind,
          period: input.period,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      const row = selectCurrent(tx, input.siteId, input.id)
      if (row === undefined) throw new Error('Cohort insert returned no row')
      return toCohort(row.cohort, row.version)
    })
  }

  async update(input: CohortRepository.UpdateInput): Promise<CohortRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.cohortId)
      if (current === undefined) {
        return rawExists(tx, input.siteId, input.cohortId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.cohort.status !== 'active') return { status: 'conflict' }
      const version = current.cohort.currentVersion + 1
      tx.insert(schema.TCohortVersion)
        .values({
          id: `${input.cohortId}:v${version}`,
          cohortId: input.cohortId,
          version,
          name: input.name,
          entryActionJson: toJsonObject(input.entryAction),
          retentionActionJson: toJsonObject(input.retentionAction),
          identityKind: input.identityKind,
          period: input.period,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      tx.update(schema.TCohort)
        .set({
          name: input.name,
          identityKind: input.identityKind,
          period: input.period,
          currentVersion: version,
          updatedAt: input.now,
        })
        .where(and(eq(schema.TCohort.id, input.cohortId), eq(schema.TCohort.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.cohortId)
      if (row === undefined) throw new Error('Cohort update returned no row')
      return { status: 'updated', cohort: toCohort(row.cohort, row.version) }
    })
  }

  async archive(input: CohortRepository.ArchiveInput): Promise<CohortRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.cohortId)
      if (current === undefined) {
        return rawExists(tx, input.siteId, input.cohortId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.cohort.status !== 'active') return { status: 'conflict' }
      tx.update(schema.TCohort)
        .set({ status: 'archived', updatedAt: input.now })
        .where(and(eq(schema.TCohort.id, input.cohortId), eq(schema.TCohort.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.cohortId)
      if (row === undefined) throw new Error('Cohort archive returned no row')
      return { status: 'updated', cohort: toCohort(row.cohort, row.version) }
    })
  }
}

function liveSite(db: Db) {
  return and(
    exists(
      db
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(and(eq(schema.TSite.id, schema.TCohort.siteId), eq(schema.TSite.status, 'active'))),
    ),
    notExists(
      db
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(eq(schema.TSiteTombstone.siteId, schema.TCohort.siteId)),
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

function selectCurrent(tx: SqliteTransaction, siteId: string, cohortId: string) {
  return tx
    .select({ cohort: schema.TCohort, version: schema.TCohortVersion })
    .from(schema.TCohort)
    .innerJoin(
      schema.TCohortVersion,
      and(
        eq(schema.TCohortVersion.cohortId, schema.TCohort.id),
        eq(schema.TCohortVersion.version, schema.TCohort.currentVersion),
      ),
    )
    .where(and(eq(schema.TCohort.siteId, siteId), eq(schema.TCohort.id, cohortId)))
    .limit(1)
    .all()[0]
}

function rawExists(tx: SqliteTransaction, siteId: string, cohortId: string): boolean {
  return (
    tx
      .select({ id: schema.TCohort.id })
      .from(schema.TCohort)
      .where(and(eq(schema.TCohort.siteId, siteId), eq(schema.TCohort.id, cohortId)))
      .limit(1)
      .all().length > 0
  )
}

function toCohort(
  row: typeof schema.TCohort.$inferSelect,
  version: typeof schema.TCohortVersion.$inferSelect,
): CohortRepository.Cohort {
  const definition = parse(contractSchema.SCohortDefinitionFields, {
    name: version.name,
    entryAction: version.entryActionJson,
    retentionAction: version.retentionActionJson,
    identityKind: version.identityKind,
    period: version.period,
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
