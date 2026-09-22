import { and, eq, exists, isNotNull, notExists } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import type { PublicDashboardRepository } from './repository.ts'

export interface PublicDashboardRepositoryDrizzleDependencies {
  readonly db: Db
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

export class PublicDashboardRepositoryDrizzle implements PublicDashboardRepository {
  constructor(private readonly deps: PublicDashboardRepositoryDrizzleDependencies) {}

  async findBySiteId(siteId: string): Promise<PublicDashboardRepository.Config | undefined> {
    const row = this.deps.db
      .select({ dashboard: schema.TPublicDashboard })
      .from(schema.TPublicDashboard)
      .where(and(eq(schema.TPublicDashboard.siteId, siteId), liveActiveSite(this.deps.db)))
      .limit(1)
      .all()[0]
    return row === undefined ? undefined : toConfig(row.dashboard)
  }

  async findByIdentifierHash(
    identifierHash: string,
  ): Promise<PublicDashboardRepository.Config | undefined> {
    const row = this.deps.db
      .select({ dashboard: schema.TPublicDashboard })
      .from(schema.TPublicDashboard)
      .where(
        and(
          eq(schema.TPublicDashboard.publicIdentifierHash, identifierHash),
          isNotNull(schema.TPublicDashboard.publicIdentifier),
          eq(schema.TPublicDashboard.enabled, true),
          liveActiveSite(this.deps.db),
        ),
      )
      .limit(1)
      .all()[0]
    return row === undefined ? undefined : toConfig(row.dashboard)
  }

  async enable(
    input: PublicDashboardRepository.EnableInput,
  ): Promise<PublicDashboardRepository.Mutation> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectBySiteId(tx, input.siteId)
      if (current === undefined) {
        tx.insert(schema.TPublicDashboard)
          .values({
            siteId: input.siteId,
            enabled: true,
            publicIdentifier: input.identifier,
            publicIdentifierHash: input.identifierHash,
            createdAt: input.now,
            updatedAt: input.now,
            rotatedAt: input.now,
          })
          .run()
      } else {
        tx.update(schema.TPublicDashboard)
          .set({
            enabled: true,
            publicIdentifier: input.identifier,
            publicIdentifierHash: input.identifierHash,
            updatedAt: input.now,
            rotatedAt: input.now,
          })
          .where(eq(schema.TPublicDashboard.siteId, input.siteId))
          .run()
      }
      const dashboard = selectBySiteId(tx, input.siteId)
      if (dashboard === undefined) throw new Error('Public dashboard enable returned no row')
      return { status: 'updated', config: toConfig(dashboard) }
    })
  }

  async disable(
    input: PublicDashboardRepository.DisableInput,
  ): Promise<PublicDashboardRepository.Mutation> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectBySiteId(tx, input.siteId)
      if (current === undefined) return { status: 'not-found' }
      tx.update(schema.TPublicDashboard)
        .set({ enabled: false, updatedAt: input.now })
        .where(eq(schema.TPublicDashboard.siteId, input.siteId))
        .run()
      const dashboard = selectBySiteId(tx, input.siteId)
      if (dashboard === undefined) throw new Error('Public dashboard disable returned no row')
      return { status: 'updated', config: toConfig(dashboard) }
    })
  }

  async rotate(
    input: PublicDashboardRepository.RotateInput,
  ): Promise<PublicDashboardRepository.Mutation> {
    return this.deps.db.transaction((tx) => {
      assertActiveSite(tx, input.siteId)
      const current = selectBySiteId(tx, input.siteId)
      if (current === undefined) return { status: 'not-found' }
      if (!current.enabled && current.publicIdentifier !== null) {
        return { status: 'conflict' }
      }
      tx.update(schema.TPublicDashboard)
        .set({
          enabled: true,
          publicIdentifier: input.identifier,
          publicIdentifierHash: input.identifierHash,
          updatedAt: input.now,
          rotatedAt: input.now,
        })
        .where(eq(schema.TPublicDashboard.siteId, input.siteId))
        .run()
      const dashboard = selectBySiteId(tx, input.siteId)
      if (dashboard === undefined) throw new Error('Public dashboard rotation returned no row')
      return { status: 'updated', config: toConfig(dashboard) }
    })
  }
}

function liveActiveSite(db: Db | SqliteTransaction) {
  return and(
    exists(
      db
        .select({ id: schema.TSite.id })
        .from(schema.TSite)
        .where(
          and(
            eq(schema.TSite.id, schema.TPublicDashboard.siteId),
            eq(schema.TSite.status, 'active'),
          ),
        ),
    ),
    notExists(
      db
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(eq(schema.TSiteTombstone.siteId, schema.TPublicDashboard.siteId)),
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
            .where(eq(schema.TSiteTombstone.siteId, siteId)),
        ),
      ),
    )
    .limit(1)
    .all()
  if (rows.length === 0) throw new ORPCError('NOT_FOUND')
}

function selectBySiteId(tx: SqliteTransaction, siteId: string) {
  return tx
    .select()
    .from(schema.TPublicDashboard)
    .where(eq(schema.TPublicDashboard.siteId, siteId))
    .limit(1)
    .all()[0]
}

function toConfig(
  row: typeof schema.TPublicDashboard.$inferSelect,
): PublicDashboardRepository.Config {
  return {
    siteId: row.siteId,
    enabled: row.enabled,
    publicDashboardIdentifier: row.publicIdentifier,
    updatedAt: row.updatedAt.toISOString(),
  }
}
