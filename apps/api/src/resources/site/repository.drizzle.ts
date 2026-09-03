import { and, asc, count, eq, inArray, lte } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { SiteRepository } from './repository.ts'

export interface SiteRepositoryDrizzleDependencies {
  db: Db
}

const RECOVERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export class SiteRepositoryDrizzle implements SiteRepository {
  private readonly db: Db

  constructor({ db }: SiteRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findById(siteId: string): Promise<SiteRepository.SiteRecord | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TSite)
      .where(eq(schema.TSite.id, siteId))
      .limit(1)
    const row = rows[0]
    return row === undefined ? undefined : toSiteRecord(row)
  }

  async findMany(
    organizationId: string,
    options: SiteRepository.FindManyOptions,
  ): Promise<SiteRepository.FindManyResult> {
    const where = and(
      eq(schema.TSite.organizationId, organizationId),
      eq(schema.TSite.status, 'active'),
    )
    const [countRow] = await this.db.select({ count: count() }).from(schema.TSite).where(where)
    const rows = await this.db
      .select()
      .from(schema.TSite)
      .where(where)
      .orderBy(asc(schema.TSite.createdAt), asc(schema.TSite.id))
      .limit(options.limit + 1)
      .offset(options.offset)
    const hasMore = rows.length > options.limit
    return {
      items: rows.slice(0, options.limit).map(toSite),
      nextOffset: hasMore ? options.offset + options.limit : null,
      hasMore,
      totalCount: countRow?.count ?? 0,
    }
  }

  async insert(input: SiteRepository.CreateInput): Promise<SiteRepository.Site> {
    return this.db.transaction((tx) => {
      const tombstones = tx
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(
          and(
            eq(schema.TSiteTombstone.organizationId, input.organizationId),
            eq(schema.TSiteTombstone.hostname, input.hostname),
          ),
        )
        .limit(1)
        .all()
      if (tombstones.length > 0) throw new Error('Site hostname is reserved by a tombstone')
      const rows = tx
        .insert(schema.TSite)
        .values({
          id: input.id,
          organizationId: input.organizationId,
          name: input.name,
          hostname: input.hostname,
          ingestionIdentifier: input.ingestionIdentifier,
          reportingTimezone: input.reportingTimezone,
          weekStartsOn: input.weekStartsOn,
          status: 'active',
          deleteRequestedAt: null,
          deletedAt: null,
          recoveryDeadline: null,
          purgeAt: null,
          purgedAt: null,
          currentOperationId: null,
          cleanupStatus: 'not-required',
          cleanupUpdatedAt: input.updatedAt,
          cleanupError: null,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
        })
        .returning()
        .all()
      const row = rows[0]
      if (row === undefined) throw new Error('Site insert returned no row')
      return toSite(row)
    })
  }

  async updateActive(input: SiteRepository.UpdateInput): Promise<SiteRepository.Site | undefined> {
    return this.db.transaction((tx) => {
      const currentRows = tx
        .select({ organizationId: schema.TSite.organizationId })
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()
      const current = currentRows[0]
      if (current === undefined) return undefined
      const tombstones = tx
        .select({ siteId: schema.TSiteTombstone.siteId })
        .from(schema.TSiteTombstone)
        .where(
          and(
            eq(schema.TSiteTombstone.organizationId, current.organizationId),
            eq(schema.TSiteTombstone.hostname, input.hostname),
          ),
        )
        .limit(1)
        .all()
      if (tombstones.length > 0) throw new Error('Site hostname is reserved by a tombstone')
      const rows = tx
        .update(schema.TSite)
        .set({
          name: input.name,
          hostname: input.hostname,
          reportingTimezone: input.reportingTimezone,
          weekStartsOn: input.weekStartsOn,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.TSite.id, input.siteId), eq(schema.TSite.status, 'active')))
        .returning()
        .all()
      const row = rows[0]
      return row === undefined ? undefined : toSite(row)
    })
  }

  async rotateIngestionIdentifier(
    siteId: string,
    ingestionIdentifier: string,
  ): Promise<SiteRepository.Site | undefined> {
    const rows = await this.db
      .update(schema.TSite)
      .set({ ingestionIdentifier, updatedAt: new Date() })
      .where(and(eq(schema.TSite.id, siteId), eq(schema.TSite.status, 'active')))
      .returning()
    const row = rows[0]
    return row === undefined ? undefined : toSite(row)
  }

  async beginDelete(
    input: SiteRepository.BeginDeleteInput,
  ): Promise<SiteRepository.LifecycleResult> {
    return this.db.transaction((tx) => {
      const site = tx
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()[0]
      if (site === undefined) {
        const tombstone = tx
          .select({ siteId: schema.TSiteTombstone.siteId })
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, input.siteId))
          .limit(1)
          .all()[0]
        return tombstone === undefined
          ? { status: 'not-found' }
          : { status: 'conflict', currentStatus: 'purged' }
      }

      if (site.status === 'deleting' && site.currentOperationId !== null) {
        const operation = tx
          .select({ id: schema.TSiteLifecycleOperation.id })
          .from(schema.TSiteLifecycleOperation)
          .where(
            and(
              eq(schema.TSiteLifecycleOperation.id, site.currentOperationId),
              eq(schema.TSiteLifecycleOperation.operationType, 'delete'),
              inArray(schema.TSiteLifecycleOperation.status, ['pending', 'running']),
            ),
          )
          .limit(1)
          .all()[0]
        if (operation !== undefined) return { status: 'accepted', operationId: operation.id }
      }
      if (site.status !== 'active') return { status: 'conflict', currentStatus: site.status }

      const activeOperation = tx
        .select({ id: schema.TSiteLifecycleOperation.id })
        .from(schema.TSiteLifecycleOperation)
        .where(
          and(
            eq(schema.TSiteLifecycleOperation.siteId, input.siteId),
            inArray(schema.TSiteLifecycleOperation.status, ['pending', 'running']),
          ),
        )
        .limit(1)
        .all()[0]
      if (activeOperation !== undefined) {
        return { status: 'conflict', currentStatus: site.status }
      }

      tx.insert(schema.TSiteLifecycleOperation)
        .values({
          id: input.operationId,
          siteId: input.siteId,
          operationType: 'delete',
          status: 'pending',
          requestedAt: input.requestedAt,
          startedAt: null,
          completedAt: null,
          errorSummary: null,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
        })
        .run()
      const updated = tx
        .update(schema.TSite)
        .set({
          status: 'deleting',
          deleteRequestedAt: input.requestedAt,
          currentOperationId: input.operationId,
          cleanupStatus: 'pending',
          cleanupUpdatedAt: input.requestedAt,
          cleanupError: null,
          updatedAt: input.requestedAt,
        })
        .where(and(eq(schema.TSite.id, input.siteId), eq(schema.TSite.status, 'active')))
        .run()
      if (updated.changes !== 1) throw new Error('Site deletion transition was lost')
      return { status: 'accepted', operationId: input.operationId }
    })
  }

  async beginRecover(
    input: SiteRepository.BeginRecoverInput,
  ): Promise<SiteRepository.LifecycleResult> {
    return this.db.transaction((tx) => {
      const site = tx
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()[0]
      if (site === undefined) {
        const tombstone = tx
          .select({ siteId: schema.TSiteTombstone.siteId })
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, input.siteId))
          .limit(1)
          .all()[0]
        return tombstone === undefined
          ? { status: 'not-found' }
          : { status: 'conflict', currentStatus: 'purged' }
      }

      if (site.status === 'recovering' && site.currentOperationId !== null) {
        const operation = tx
          .select({ id: schema.TSiteLifecycleOperation.id })
          .from(schema.TSiteLifecycleOperation)
          .where(
            and(
              eq(schema.TSiteLifecycleOperation.id, site.currentOperationId),
              eq(schema.TSiteLifecycleOperation.operationType, 'recover'),
              inArray(schema.TSiteLifecycleOperation.status, ['pending', 'running']),
            ),
          )
          .limit(1)
          .all()[0]
        if (operation !== undefined) return { status: 'accepted', operationId: operation.id }
      }
      if (site.status !== 'deleting' && site.status !== 'deleted') {
        return { status: 'conflict', currentStatus: site.status }
      }
      if (
        site.status === 'deleted' &&
        (site.recoveryDeadline === null || input.requestedAt >= site.recoveryDeadline)
      ) {
        return { status: 'conflict', currentStatus: 'deleted' }
      }

      if (site.currentOperationId !== null) {
        tx.update(schema.TSiteLifecycleOperation)
          .set({ status: 'cancelled', updatedAt: input.requestedAt })
          .where(
            and(
              eq(schema.TSiteLifecycleOperation.id, site.currentOperationId),
              inArray(schema.TSiteLifecycleOperation.status, ['pending', 'running']),
            ),
          )
          .run()
      }
      tx.insert(schema.TSiteLifecycleOperation)
        .values({
          id: input.operationId,
          siteId: input.siteId,
          operationType: 'recover',
          status: 'pending',
          requestedAt: input.requestedAt,
          startedAt: null,
          completedAt: null,
          errorSummary: null,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
        })
        .run()
      const updated = tx
        .update(schema.TSite)
        .set({
          status: 'recovering',
          currentOperationId: input.operationId,
          cleanupStatus: 'pending',
          cleanupUpdatedAt: input.requestedAt,
          cleanupError: null,
          updatedAt: input.requestedAt,
        })
        .where(
          and(
            eq(schema.TSite.id, input.siteId),
            inArray(schema.TSite.status, ['deleting', 'deleted']),
          ),
        )
        .run()
      if (updated.changes !== 1) throw new Error('Site recovery transition was lost')
      return { status: 'accepted', operationId: input.operationId }
    })
  }

  async completeDelete(
    input: SiteRepository.CompleteDeleteInput,
  ): Promise<SiteRepository.LifecycleExecutionResult> {
    return this.db.transaction((tx) => {
      const site = tx
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()[0]
      if (site === undefined) return { status: 'not-found' }
      const operation = tx
        .select()
        .from(schema.TSiteLifecycleOperation)
        .where(eq(schema.TSiteLifecycleOperation.id, input.operationId))
        .limit(1)
        .all()[0]
      if (
        site.status === 'deleted' &&
        site.currentOperationId === input.operationId &&
        operation?.operationType === 'delete' &&
        operation.status === 'completed'
      ) {
        return { status: 'completed' }
      }
      if (
        site.status !== 'deleting' ||
        site.currentOperationId !== input.operationId ||
        operation?.operationType !== 'delete' ||
        (operation.status !== 'pending' && operation.status !== 'running')
      ) {
        return { status: 'conflict', currentStatus: site.status }
      }
      const recoveryDeadline = new Date(input.completedAt.getTime() + RECOVERY_WINDOW_MS)
      const updated = tx
        .update(schema.TSite)
        .set({
          status: 'deleted',
          deletedAt: input.completedAt,
          recoveryDeadline,
          purgeAt: recoveryDeadline,
          cleanupStatus: 'pending',
          cleanupUpdatedAt: input.completedAt,
          cleanupError: null,
          updatedAt: input.completedAt,
        })
        .where(
          and(
            eq(schema.TSite.id, input.siteId),
            eq(schema.TSite.status, 'deleting'),
            eq(schema.TSite.currentOperationId, input.operationId),
          ),
        )
        .run()
      if (updated.changes !== 1) throw new Error('Site deletion completion was lost')
      tx.update(schema.TSiteLifecycleOperation)
        .set({
          status: 'completed',
          startedAt: operation.startedAt ?? input.completedAt,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        })
        .where(eq(schema.TSiteLifecycleOperation.id, input.operationId))
        .run()
      return { status: 'completed' }
    })
  }

  async completeRecover(
    input: SiteRepository.CompleteRecoverInput,
  ): Promise<SiteRepository.LifecycleExecutionResult> {
    return this.db.transaction((tx) => {
      const site = tx
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()[0]
      if (site === undefined) {
        const tombstone = tx
          .select({ siteId: schema.TSiteTombstone.siteId })
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, input.siteId))
          .limit(1)
          .all()[0]
        return tombstone === undefined
          ? { status: 'not-found' }
          : { status: 'conflict', currentStatus: 'purged' }
      }
      const operation = tx
        .select()
        .from(schema.TSiteLifecycleOperation)
        .where(eq(schema.TSiteLifecycleOperation.id, input.operationId))
        .limit(1)
        .all()[0]
      if (
        site.status === 'active' &&
        site.currentOperationId === null &&
        operation?.operationType === 'recover' &&
        operation.status === 'completed'
      ) {
        return { status: 'completed' }
      }
      if (
        site.status !== 'recovering' ||
        site.currentOperationId !== input.operationId ||
        operation?.operationType !== 'recover' ||
        (operation.status !== 'pending' && operation.status !== 'running')
      ) {
        return { status: 'conflict', currentStatus: site.status }
      }
      const updated = tx
        .update(schema.TSite)
        .set({
          status: 'active',
          deleteRequestedAt: null,
          deletedAt: null,
          recoveryDeadline: null,
          purgeAt: null,
          purgedAt: null,
          currentOperationId: null,
          cleanupStatus: 'not-required',
          cleanupUpdatedAt: input.completedAt,
          cleanupError: null,
          updatedAt: input.completedAt,
        })
        .where(
          and(
            eq(schema.TSite.id, input.siteId),
            eq(schema.TSite.status, 'recovering'),
            eq(schema.TSite.currentOperationId, input.operationId),
          ),
        )
        .run()
      if (updated.changes !== 1) throw new Error('Site recovery completion was lost')
      tx.update(schema.TSiteLifecycleOperation)
        .set({
          status: 'completed',
          startedAt: operation.startedAt ?? input.completedAt,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        })
        .where(eq(schema.TSiteLifecycleOperation.id, input.operationId))
        .run()
      return { status: 'completed' }
    })
  }

  async purge(input: SiteRepository.PurgeInput): Promise<SiteRepository.LifecycleExecutionResult> {
    return this.db.transaction((tx) => {
      const existingTombstone = tx
        .select({ purgeOperationId: schema.TSiteTombstone.purgeOperationId })
        .from(schema.TSiteTombstone)
        .where(eq(schema.TSiteTombstone.siteId, input.siteId))
        .limit(1)
        .all()[0]
      if (existingTombstone !== undefined) {
        return existingTombstone.purgeOperationId === input.operationId
          ? { status: 'completed' }
          : { status: 'conflict', currentStatus: 'purged' }
      }
      const site = tx
        .select()
        .from(schema.TSite)
        .where(eq(schema.TSite.id, input.siteId))
        .limit(1)
        .all()[0]
      if (site === undefined) return { status: 'not-found' }
      if (
        site.status !== 'deleted' ||
        site.deletedAt === null ||
        site.recoveryDeadline === null ||
        site.purgeAt === null ||
        input.requestedAt < site.purgeAt
      ) {
        return { status: 'conflict', currentStatus: site.status }
      }
      tx.insert(schema.TSiteLifecycleOperation)
        .values({
          id: input.operationId,
          siteId: input.siteId,
          operationType: 'purge',
          status: 'completed',
          requestedAt: input.requestedAt,
          startedAt: input.requestedAt,
          completedAt: input.requestedAt,
          errorSummary: null,
          createdAt: input.requestedAt,
          updatedAt: input.requestedAt,
        })
        .run()
      tx.insert(schema.TSiteTombstone)
        .values({
          siteId: site.id,
          organizationId: site.organizationId,
          hostname: site.hostname,
          purgeOperationId: input.operationId,
          purgedAt: input.requestedAt,
          createdAt: input.requestedAt,
        })
        .run()
      // Clear restrictive Site-scoped references before deleting the live Site row.
      tx.delete(schema.TAcceptedEvent).where(eq(schema.TAcceptedEvent.siteId, input.siteId)).run()
      tx.delete(schema.TCollectionPolicyRevision)
        .where(eq(schema.TCollectionPolicyRevision.siteId, input.siteId))
        .run()
      tx.delete(schema.TIdentityRedaction)
        .where(eq(schema.TIdentityRedaction.siteId, input.siteId))
        .run()
      tx.delete(schema.TIdentityLink).where(eq(schema.TIdentityLink.siteId, input.siteId)).run()
      tx.delete(schema.TIdentityProfileEpoch)
        .where(eq(schema.TIdentityProfileEpoch.siteId, input.siteId))
        .run()
      tx.delete(schema.TIdentityProfile)
        .where(eq(schema.TIdentityProfile.siteId, input.siteId))
        .run()
      tx.delete(schema.TRetentionCleanupRun)
        .where(eq(schema.TRetentionCleanupRun.siteId, input.siteId))
        .run()
      tx.delete(schema.TRetentionPolicy)
        .where(eq(schema.TRetentionPolicy.siteId, input.siteId))
        .run()
      tx.delete(schema.TProjectionCheckpoint)
        .where(eq(schema.TProjectionCheckpoint.siteId, input.siteId))
        .run()
      tx.delete(schema.TProjectionGap).where(eq(schema.TProjectionGap.siteId, input.siteId)).run()
      tx.delete(schema.TGoal).where(eq(schema.TGoal.siteId, input.siteId)).run()
      tx.delete(schema.TFunnel).where(eq(schema.TFunnel.siteId, input.siteId)).run()
      tx.delete(schema.TCohort).where(eq(schema.TCohort.siteId, input.siteId)).run()
      tx.delete(schema.TPublicDashboard)
        .where(eq(schema.TPublicDashboard.siteId, input.siteId))
        .run()
      const deleted = tx
        .delete(schema.TSite)
        .where(and(eq(schema.TSite.id, input.siteId), eq(schema.TSite.status, 'deleted')))
        .run()
      if (deleted.changes !== 1) throw new Error('Site purge transition was lost')
      return { status: 'completed' }
    })
  }

  async findPendingLifecycleOperations(): Promise<SiteRepository.LifecycleOperation[]> {
    const rows = await this.db
      .select({
        siteId: schema.TSiteLifecycleOperation.siteId,
        operationId: schema.TSiteLifecycleOperation.id,
        operationType: schema.TSiteLifecycleOperation.operationType,
        status: schema.TSiteLifecycleOperation.status,
      })
      .from(schema.TSiteLifecycleOperation)
      .where(
        and(
          inArray(schema.TSiteLifecycleOperation.operationType, ['delete', 'recover']),
          inArray(schema.TSiteLifecycleOperation.status, ['pending', 'running']),
        ),
      )
      .orderBy(
        asc(schema.TSiteLifecycleOperation.createdAt),
        asc(schema.TSiteLifecycleOperation.id),
      )

    return rows.flatMap((row) => {
      if (
        (row.operationType !== 'delete' && row.operationType !== 'recover') ||
        (row.status !== 'pending' && row.status !== 'running')
      ) {
        return []
      }
      return [
        {
          siteId: row.siteId,
          operationId: row.operationId,
          operationType: row.operationType,
          status: row.status,
        },
      ]
    })
  }

  async findDuePurges(requestedAt: Date): Promise<SiteRepository.DuePurge[]> {
    return this.db
      .select({ siteId: schema.TSite.id })
      .from(schema.TSite)
      .where(and(eq(schema.TSite.status, 'deleted'), lte(schema.TSite.purgeAt, requestedAt)))
      .orderBy(asc(schema.TSite.purgeAt), asc(schema.TSite.id))
  }

  async getDeletionStatus(siteId: string): Promise<SiteRepository.DeletionStatus | undefined> {
    const rows = await this.db
      .select()
      .from(schema.TSite)
      .where(eq(schema.TSite.id, siteId))
      .limit(1)
    const site = rows[0]
    if (site === undefined) {
      const tombstone = (
        await this.db
          .select()
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, siteId))
          .limit(1)
      )[0]
      if (tombstone === undefined) return undefined
      return {
        siteId: tombstone.siteId,
        status: 'purged',
        operationId: tombstone.purgeOperationId,
        requestedAt: tombstone.purgedAt.toISOString(),
        deletedAt: tombstone.purgedAt.toISOString(),
        recoveryDeadline: tombstone.purgedAt.toISOString(),
        purgeAt: tombstone.purgedAt.toISOString(),
        cleanup: {
          status: 'complete',
          updatedAt: tombstone.purgedAt.toISOString(),
          error: null,
        },
      }
    }

    const operation =
      site.currentOperationId === null
        ? undefined
        : (
            await this.db
              .select()
              .from(schema.TSiteLifecycleOperation)
              .where(eq(schema.TSiteLifecycleOperation.id, site.currentOperationId))
              .limit(1)
          )[0]
    const operationId = site.status === 'active' ? null : site.currentOperationId
    const requestedAt =
      site.status === 'active'
        ? null
        : ((operation?.requestedAt ?? site.deleteRequestedAt)?.toISOString() ?? null)
    return {
      siteId: site.id,
      status: site.status,
      operationId,
      requestedAt,
      deletedAt: site.deletedAt?.toISOString() ?? null,
      recoveryDeadline: site.recoveryDeadline?.toISOString() ?? null,
      purgeAt: site.purgeAt?.toISOString() ?? null,
      cleanup: {
        status: site.cleanupStatus,
        updatedAt: (site.cleanupUpdatedAt ?? site.updatedAt).toISOString(),
        error: site.cleanupError,
      },
    }
  }
}

function toSite(row: typeof schema.TSite.$inferSelect): SiteRepository.Site {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    hostname: row.hostname,
    ingestionIdentifier: row.ingestionIdentifier,
    reportingTimezone: row.reportingTimezone,
    weekStartsOn: row.weekStartsOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toSiteRecord(row: typeof schema.TSite.$inferSelect): SiteRepository.SiteRecord {
  return {
    ...toSite(row),
    status: row.status,
    deleteRequestedAt: row.deleteRequestedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    recoveryDeadline: row.recoveryDeadline?.toISOString() ?? null,
    purgeAt: row.purgeAt?.toISOString() ?? null,
    purgedAt: row.purgedAt?.toISOString() ?? null,
    currentOperationId: row.currentOperationId,
    cleanupStatus: row.cleanupStatus,
    cleanupUpdatedAt: row.cleanupUpdatedAt?.toISOString() ?? null,
    cleanupError: row.cleanupError,
  }
}
