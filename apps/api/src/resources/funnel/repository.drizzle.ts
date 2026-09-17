import { and, asc, count, desc, eq, exists, lte, notExists } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import { parse } from 'valibot'
import { toJsonValue } from '../reporting/model.ts'
import type { FunnelRepository } from './repository.ts'

export interface FunnelRepositoryDrizzleDependencies {
  readonly db: Db
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export class FunnelRepositoryDrizzle implements FunnelRepository {
  constructor(private readonly deps: FunnelRepositoryDrizzleDependencies) {}

  async findById(
    input: FunnelRepository.IdentityInput | FunnelRepository.UnscopedIdentityInput,
  ): Promise<FunnelRepository.Funnel | undefined> {
    const rows = await this.deps.db
      .select({ funnel: schema.TFunnel, version: schema.TFunnelVersion })
      .from(schema.TFunnel)
      .innerJoin(
        schema.TFunnelVersion,
        and(
          eq(schema.TFunnelVersion.funnelId, schema.TFunnel.id),
          eq(schema.TFunnelVersion.version, schema.TFunnel.currentVersion),
        ),
      )
      .where(
        and(
          eq(schema.TFunnel.id, input.funnelId),
          ...('siteId' in input ? [eq(schema.TFunnel.siteId, input.siteId)] : []),
          liveSite(this.deps.db),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toFunnel(row.funnel, row.version)
  }

  async findVersionAt(
    input: FunnelRepository.VersionInput,
  ): Promise<FunnelRepository.Funnel | undefined> {
    if ((await this.findById({ siteId: input.siteId, funnelId: input.funnelId })) === undefined) {
      return undefined
    }
    const rows = await this.deps.db
      .select({ funnel: schema.TFunnel, version: schema.TFunnelVersion })
      .from(schema.TFunnel)
      .innerJoin(
        schema.TFunnelVersion,
        and(
          eq(schema.TFunnelVersion.funnelId, schema.TFunnel.id),
          lte(schema.TFunnelVersion.effectiveAt, input.at),
        ),
      )
      .where(
        and(
          eq(schema.TFunnel.id, input.funnelId),
          eq(schema.TFunnel.siteId, input.siteId),
          liveSite(this.deps.db),
        ),
      )
      .orderBy(desc(schema.TFunnelVersion.effectiveAt), desc(schema.TFunnelVersion.version))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toFunnel(row.funnel, row.version)
  }

  async findMany(input: FunnelRepository.ListInput): Promise<FunnelRepository.ListResult> {
    const where = and(eq(schema.TFunnel.siteId, input.siteId), liveSite(this.deps.db))
    const [countRow] = await this.deps.db
      .select({ count: count() })
      .from(schema.TFunnel)
      .innerJoin(
        schema.TFunnelVersion,
        and(
          eq(schema.TFunnelVersion.funnelId, schema.TFunnel.id),
          eq(schema.TFunnelVersion.version, schema.TFunnel.currentVersion),
        ),
      )
      .where(where)
    const rows = await this.deps.db
      .select({ funnel: schema.TFunnel, version: schema.TFunnelVersion })
      .from(schema.TFunnel)
      .innerJoin(
        schema.TFunnelVersion,
        and(
          eq(schema.TFunnelVersion.funnelId, schema.TFunnel.id),
          eq(schema.TFunnelVersion.version, schema.TFunnel.currentVersion),
        ),
      )
      .where(where)
      .orderBy(asc(schema.TFunnel.createdAt), asc(schema.TFunnel.id))
      .limit(input.limit + 1)
      .offset(input.offset)
    const hasMore = rows.length > input.limit
    return {
      items: rows.slice(0, input.limit).map((row) => toFunnel(row.funnel, row.version)),
      nextOffset: hasMore ? input.offset + input.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async insert(input: FunnelRepository.InsertInput): Promise<FunnelRepository.Funnel> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      tx.insert(schema.TFunnel)
        .values({
          id: input.id,
          siteId: input.siteId,
          name: input.name,
          identityKind: input.identityKind,
          status: 'active',
          currentVersion: 1,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run()
      tx.insert(schema.TFunnelVersion)
        .values({
          id: `${input.id}:v1`,
          funnelId: input.id,
          version: 1,
          name: input.name,
          stepsJson: toJsonValue(input.steps),
          identityKind: input.identityKind,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      const row = selectCurrent(tx, input.siteId, input.id)
      if (row === undefined) throw new Error('Funnel insert returned no row')
      return toFunnel(row.funnel, row.version)
    })
  }

  async update(input: FunnelRepository.UpdateInput): Promise<FunnelRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.funnelId)
      if (current === undefined) {
        return rawExists(tx, input.siteId, input.funnelId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.funnel.status !== 'active') return { status: 'conflict' }
      const version = current.funnel.currentVersion + 1
      tx.insert(schema.TFunnelVersion)
        .values({
          id: `${input.funnelId}:v${version}`,
          funnelId: input.funnelId,
          version,
          name: input.name,
          stepsJson: toJsonValue(input.steps),
          identityKind: input.identityKind,
          effectiveAt: input.now,
          createdAt: input.now,
        })
        .run()
      tx.update(schema.TFunnel)
        .set({
          name: input.name,
          identityKind: input.identityKind,
          currentVersion: version,
          updatedAt: input.now,
        })
        .where(and(eq(schema.TFunnel.id, input.funnelId), eq(schema.TFunnel.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.funnelId)
      if (row === undefined) throw new Error('Funnel update returned no row')
      return { status: 'updated', funnel: toFunnel(row.funnel, row.version) }
    })
  }

  async archive(input: FunnelRepository.ArchiveInput): Promise<FunnelRepository.MutationResult> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectCurrent(tx, input.siteId, input.funnelId)
      if (current === undefined) {
        return rawExists(tx, input.siteId, input.funnelId)
          ? { status: 'conflict' }
          : { status: 'not-found' }
      }
      if (current.funnel.status !== 'active') return { status: 'conflict' }
      tx.update(schema.TFunnel)
        .set({ status: 'archived', updatedAt: input.now })
        .where(and(eq(schema.TFunnel.id, input.funnelId), eq(schema.TFunnel.siteId, input.siteId)))
        .run()
      const row = selectCurrent(tx, input.siteId, input.funnelId)
      if (row === undefined) throw new Error('Funnel archive returned no row')
      return { status: 'updated', funnel: toFunnel(row.funnel, row.version) }
    })
  }
}

function liveSite(db: Db) {
  return and(
    exists(
      db
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(and(eq(schema.TSite.id, schema.TFunnel.siteId), eq(schema.TSite.status, 'active'))),
    ),
    notExists(
      db
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(eq(schema.TSiteTombstone.siteId, schema.TFunnel.siteId)),
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

function selectCurrent(tx: SqliteTransaction, siteId: string, funnelId: string) {
  return tx
    .select({ funnel: schema.TFunnel, version: schema.TFunnelVersion })
    .from(schema.TFunnel)
    .innerJoin(
      schema.TFunnelVersion,
      and(
        eq(schema.TFunnelVersion.funnelId, schema.TFunnel.id),
        eq(schema.TFunnelVersion.version, schema.TFunnel.currentVersion),
      ),
    )
    .where(and(eq(schema.TFunnel.siteId, siteId), eq(schema.TFunnel.id, funnelId)))
    .limit(1)
    .all()[0]
}

function rawExists(tx: SqliteTransaction, siteId: string, funnelId: string): boolean {
  return (
    tx
      .select({ id: schema.TFunnel.id })
      .from(schema.TFunnel)
      .where(and(eq(schema.TFunnel.siteId, siteId), eq(schema.TFunnel.id, funnelId)))
      .limit(1)
      .all().length > 0
  )
}

function toFunnel(
  row: typeof schema.TFunnel.$inferSelect,
  version: typeof schema.TFunnelVersion.$inferSelect,
): FunnelRepository.Funnel {
  const definition = parse(contractSchema.SFunnelDefinitionFields, {
    name: version.name,
    steps: version.stepsJson,
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
