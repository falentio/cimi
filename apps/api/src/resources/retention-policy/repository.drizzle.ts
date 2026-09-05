import { and, asc, desc, eq, inArray, lt, notInArray } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import { generateId, resolveSiteLocalCutoff, resolveSiteLocalDay } from '@cimi/utils'
import { parse } from 'valibot'
import { ORPCError } from '@orpc/server'
import type { RetentionPolicyRepository } from './repository.ts'

export interface RetentionPolicyRepositoryDrizzleDependencies {
  db: Db
}

const DEFAULT_POLICY = contractSchema.DEFAULT_RETENTION_POLICY

export class RetentionPolicyRepositoryDrizzle implements RetentionPolicyRepository {
  private readonly db: Db

  constructor({ db }: RetentionPolicyRepositoryDrizzleDependencies) {
    this.db = db
  }

  async findResolved(
    input: RetentionPolicyRepository.FindResolvedInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    const installation = await this.findInstallation()
    if (installation === undefined) throw new ORPCError('NOT_FOUND')
    const installationPolicy = await this.findActiveInstallationPolicy(installation.id)
    const installationDefault = installationPolicy?.policy ?? { ...DEFAULT_POLICY }
    const siteRow =
      input.siteId === null
        ? undefined
        : await this.findActiveSitePolicy(installation.id, input.siteId)
    const siteOverride = siteRow?.policy ?? null
    return {
      installationId: installation.id,
      installationDefault,
      siteOverride,
      effectivePolicy: { ...(siteOverride ?? installationDefault) },
      cleanup: toCleanupSummary(installation),
      updatedAt: (
        siteRow?.updatedAt ??
        installationPolicy?.updatedAt ??
        installation.updatedAt
      ).toISOString(),
    }
  }

  async commitPolicyChange(
    input: RetentionPolicyRepository.CommitPolicyChangeInput,
  ): Promise<RetentionPolicyRepository.PolicyCommit> {
    return this.db.transaction((tx) => {
      const installation = selectInstallation(tx)
      if (installation === undefined) throw new ORPCError('NOT_FOUND')

      let installationPolicy = selectActiveInstallationPolicy(tx, installation.id)
      let clearedSiteOverride = false
      if (input.target.scope === 'installation') {
        if (input.policy === null) throw new ORPCError('BAD_REQUEST')
        if (installationPolicy !== undefined) {
          supersedePolicy(tx, installationPolicy.id, input.now)
        }
        tx.insert(schema.TRetentionPolicy)
          .values({
            id: input.policyId,
            installationId: installation.id,
            siteId: null,
            scope: 'installation',
            eventMonths: input.policy.eventMonths,
            profileMonths: input.policy.profileMonths,
            replayMonths: input.policy.replayMonths,
            version: selectMaxInstallationVersion(tx, installation.id) + 1,
            status: 'active',
            effectiveFrom: input.now,
            effectiveTo: null,
            changedBy: input.changedBy,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run()
        tx.update(schema.TInstallation)
          .set({
            eventRetentionMonths: input.policy.eventMonths,
            profileRetentionMonths: input.policy.profileMonths,
            replayRetentionMonths: input.policy.replayMonths,
            updatedAt: input.now,
          })
          .where(eq(schema.TInstallation.singletonKey, 'default'))
          .run()
        installationPolicy = {
          id: input.policyId,
          version: selectMaxInstallationVersion(tx, installation.id),
          policy: { ...input.policy },
          updatedAt: input.now,
        }
      } else {
        const site = selectActiveSite(tx, input.target.siteId)
        if (site === undefined) throw new ORPCError('NOT_FOUND')
        const active = selectActiveSitePolicy(tx, installation.id, input.target.siteId)
        if (active !== undefined) {
          clearedSiteOverride = input.policy === null
          supersedePolicy(tx, active.id, input.now)
        }
        if (input.policy !== null) {
          tx.insert(schema.TRetentionPolicy)
            .values({
              id: input.policyId,
              installationId: installation.id,
              siteId: input.target.siteId,
              scope: 'site',
              eventMonths: input.policy.eventMonths,
              profileMonths: input.policy.profileMonths,
              replayMonths: input.policy.replayMonths,
              version: selectMaxSiteVersion(tx, installation.id, input.target.siteId) + 1,
              status: 'active',
              effectiveFrom: input.now,
              effectiveTo: null,
              changedBy: input.changedBy,
              createdAt: input.now,
              updatedAt: input.now,
            })
            .run()
        }
      }

      if (
        installationPolicy === undefined &&
        input.target.scope === 'site' &&
        input.policy === null &&
        clearedSiteOverride
      ) {
        const fallbackId = `${input.policyId}_default`
        tx.insert(schema.TRetentionPolicy)
          .values({
            id: fallbackId,
            installationId: installation.id,
            siteId: null,
            scope: 'installation',
            eventMonths: DEFAULT_POLICY.eventMonths,
            profileMonths: DEFAULT_POLICY.profileMonths,
            replayMonths: DEFAULT_POLICY.replayMonths,
            version: 1,
            status: 'active',
            effectiveFrom: input.now,
            effectiveTo: null,
            changedBy: null,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .run()
        installationPolicy = {
          id: fallbackId,
          version: 1,
          policy: { ...DEFAULT_POLICY },
          updatedAt: input.now,
        }
      }

      const sites =
        input.target.scope === 'installation'
          ? selectActiveSites(tx)
          : [selectActiveSite(tx, input.target.siteId)!]
      const affectedBoundaries: RetentionPolicyRepository.SiteRetentionBoundary[] = []
      const queuedRunIds: string[] = []
      for (const site of sites) {
        const activeSitePolicy = selectActiveSitePolicy(tx, installation.id, site.id)
        const policySource = activeSitePolicy ?? installationPolicy
        if (policySource === undefined) continue
        const effectivePolicy = policySource.policy
        const policyId = policySource.id
        const boundary = createBoundary({
          site,
          installationId: installation.id,
          policyId,
          policy: effectivePolicy,
          now: input.now,
        })
        const previous = selectBoundary(tx, site.id)
        upsertBoundary(tx, boundary)
        affectedBoundaries.push(boundary)
        if (shouldQueueCleanup(previous, boundary)) {
          for (const kind of ['derived', 'backup'] as const) {
            queuedRunIds.push(queueCleanupRun(tx, boundary, kind, input.now))
          }
          redactExpiredProfiles(tx, boundary, input.now)
        }
      }
      if (queuedRunIds.length > 0) markCleanupPending(tx, installation.id, input.now)

      const committedInstallation = selectInstallation(tx)
      if (committedInstallation === undefined)
        throw new Error('Installation disappeared during commit')
      const siteId = input.target.scope === 'site' ? input.target.siteId : null
      const resolved = selectResolved(tx, committedInstallation, siteId)
      return {
        resolution: resolved,
        affectedBoundaries,
        queuedRunIds: [...new Set(queuedRunIds)],
      }
    })
  }

  async refreshDueBoundaries(now: Date): Promise<void> {
    this.db.transaction((tx) => {
      const installation = selectInstallation(tx)
      if (installation === undefined) return
      const installationPolicy = selectActiveInstallationPolicy(tx, installation.id)
      for (const site of selectActiveSites(tx)) {
        const sitePolicy = selectActiveSitePolicy(tx, installation.id, site.id)
        const policySource = sitePolicy ?? installationPolicy
        if (policySource === undefined) continue
        const current = selectBoundary(tx, site.id)
        const localDay = resolveSiteLocalDay({ now, timeZone: site.reportingTimezone })
        if (current?.localDay === localDay && current.policyId === policySource.id) continue
        const boundary = createBoundary({
          site,
          installationId: installation.id,
          policyId: policySource.id,
          policy: policySource.policy,
          now,
        })
        upsertBoundary(tx, boundary)
        if (shouldQueueCleanup(current, boundary)) {
          queueCleanupRun(tx, boundary, 'derived', now)
          queueCleanupRun(tx, boundary, 'backup', now)
          redactExpiredProfiles(tx, boundary, now)
          markCleanupPending(tx, installation.id, now)
        }
      }
    })
  }

  async recoverInterrupted(now: Date): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(schema.TRetentionCleanupRun)
        .set({ status: 'queued', startedAt: null, updatedAt: now })
        .where(eq(schema.TRetentionCleanupRun.status, 'running'))
        .run()
      tx.update(schema.TRetentionCleanupCheckpoint)
        .set({ status: 'pending', updatedAt: now })
        .where(eq(schema.TRetentionCleanupCheckpoint.status, 'running'))
        .run()
    })
  }

  async claimNext(
    input: RetentionPolicyRepository.ClaimNextInput,
  ): Promise<RetentionPolicyRepository.CleanupWork | undefined> {
    return this.db.transaction((tx) => {
      void input.ownerToken
      const derived = selectNextRun(tx, 'derived')
      const candidate = derived ?? selectNextBackupRun(tx)
      if (candidate === undefined) return undefined
      const boundaryRow = selectBoundary(tx, candidate.siteId)
      if (boundaryRow === undefined) return undefined
      const updated = tx
        .update(schema.TRetentionCleanupRun)
        .set({
          status: 'running',
          startedAt: input.now,
          completedAt: null,
          updatedAt: input.now,
          lastError: null,
        })
        .where(
          and(
            eq(schema.TRetentionCleanupRun.id, candidate.id),
            inArray(schema.TRetentionCleanupRun.status, ['queued', 'failed']),
          ),
        )
        .run()
      if (updated.changes !== 1) return undefined
      tx.update(schema.TRetentionCleanupCheckpoint)
        .set({ status: 'running', updatedAt: input.now })
        .where(
          and(
            eq(schema.TRetentionCleanupCheckpoint.cleanupRunId, candidate.id),
            inArray(schema.TRetentionCleanupCheckpoint.status, ['pending', 'failed']),
          ),
        )
        .run()
      markCleanupStageRunning(tx, candidate.cleanupKind, input.now)
      const checkpoints = tx
        .select()
        .from(schema.TRetentionCleanupCheckpoint)
        .where(eq(schema.TRetentionCleanupCheckpoint.cleanupRunId, candidate.id))
        .all()
        .map(toCleanupCheckpoint)
      return {
        runId: candidate.id,
        kind: candidate.cleanupKind,
        siteId: candidate.siteId,
        boundary: toBoundary(boundaryRow),
        checkpoints,
      }
    })
  }

  async advance(input: RetentionPolicyRepository.AdvanceInput): Promise<void> {
    this.db.transaction((tx) => {
      tx.update(schema.TRetentionCleanupRun)
        .set({ updatedAt: input.now })
        .where(
          and(
            eq(schema.TRetentionCleanupRun.id, input.runId),
            eq(schema.TRetentionCleanupRun.cleanupKind, input.kind),
            eq(schema.TRetentionCleanupRun.status, 'running'),
          ),
        )
        .run()
      tx.update(schema.TRetentionCleanupCheckpoint)
        .set({
          cursor: input.cursor,
          processedThrough: input.processedThrough,
          status: 'running',
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TRetentionCleanupCheckpoint.cleanupRunId, input.runId),
            eq(schema.TRetentionCleanupCheckpoint.stage, input.kind),
            notInArray(schema.TRetentionCleanupCheckpoint.status, ['completed']),
          ),
        )
        .run()
    })
  }

  async succeed(input: RetentionPolicyRepository.TerminalInput): Promise<void> {
    this.db.transaction((tx) => {
      const updated = tx
        .update(schema.TRetentionCleanupRun)
        .set({ status: 'succeeded', completedAt: input.now, updatedAt: input.now })
        .where(
          and(
            eq(schema.TRetentionCleanupRun.id, input.runId),
            eq(schema.TRetentionCleanupRun.cleanupKind, input.kind),
            eq(schema.TRetentionCleanupRun.status, 'running'),
          ),
        )
        .run()
      if (updated.changes !== 1) return
      tx.update(schema.TRetentionCleanupCheckpoint)
        .set({ status: 'completed', updatedAt: input.now })
        .where(eq(schema.TRetentionCleanupCheckpoint.cleanupRunId, input.runId))
        .run()
      recomputeCleanupStatus(tx, input.now)
    })
  }

  async fail(input: RetentionPolicyRepository.FailInput): Promise<void> {
    this.db.transaction((tx) => {
      const updated = tx
        .update(schema.TRetentionCleanupRun)
        .set({
          status: 'failed',
          completedAt: input.now,
          lastError: input.errorMessage,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(schema.TRetentionCleanupRun.id, input.runId),
            eq(schema.TRetentionCleanupRun.cleanupKind, input.kind),
            eq(schema.TRetentionCleanupRun.status, 'running'),
          ),
        )
        .run()
      if (updated.changes !== 1) return
      tx.update(schema.TRetentionCleanupCheckpoint)
        .set({ status: 'failed', updatedAt: input.now })
        .where(
          and(
            eq(schema.TRetentionCleanupCheckpoint.cleanupRunId, input.runId),
            notInArray(schema.TRetentionCleanupCheckpoint.status, ['completed']),
          ),
        )
        .run()
      recomputeCleanupStatus(tx, input.now, input.errorCode)
    })
  }

  async saveInstallationDefault(
    input: RetentionPolicyRepository.SaveInstallationDefaultInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    const result = await this.commitPolicyChange({
      target: { scope: 'installation' },
      policy: input.policy,
      policyId: input.id,
      changedBy: null,
      now: input.now,
    })
    return result.resolution
  }

  async saveSiteOverride(
    input: RetentionPolicyRepository.SaveSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    const result = await this.commitPolicyChange({
      target: { scope: 'site', siteId: input.siteId },
      policy: input.policy,
      policyId: input.id,
      changedBy: null,
      now: input.now,
    })
    return result.resolution
  }

  async clearSiteOverride(
    input: RetentionPolicyRepository.ClearSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    const result = await this.commitPolicyChange({
      target: { scope: 'site', siteId: input.siteId },
      policy: null,
      policyId: `rtn_clear_${input.siteId}`,
      changedBy: null,
      now: input.now,
    })
    return result.resolution
  }

  private async findInstallation() {
    const rows = await this.db
      .select()
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .limit(1)
    return rows[0]
  }

  private async findActiveInstallationPolicy(installationId: string) {
    const rows = await this.db
      .select()
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, installationId),
          eq(schema.TRetentionPolicy.scope, 'installation'),
          eq(schema.TRetentionPolicy.status, 'active'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined
      ? undefined
      : {
          id: row.id,
          version: row.version,
          policy: toPolicy(row),
          updatedAt: row.updatedAt,
        }
  }

  private async findActiveSitePolicy(installationId: string, siteId: string) {
    const rows = await this.db
      .select()
      .from(schema.TRetentionPolicy)
      .where(
        and(
          eq(schema.TRetentionPolicy.installationId, installationId),
          eq(schema.TRetentionPolicy.siteId, siteId),
          eq(schema.TRetentionPolicy.scope, 'site'),
          eq(schema.TRetentionPolicy.status, 'active'),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row === undefined
      ? undefined
      : {
          id: row.id,
          version: row.version,
          policy: toPolicy(row),
          updatedAt: row.updatedAt,
        }
  }
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

function selectInstallation(tx: SqliteTransaction) {
  return tx
    .select()
    .from(schema.TInstallation)
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .limit(1)
    .all()[0]
}

function selectActiveInstallationPolicy(tx: SqliteTransaction, installationId: string) {
  const row = tx
    .select()
    .from(schema.TRetentionPolicy)
    .where(
      and(
        eq(schema.TRetentionPolicy.installationId, installationId),
        eq(schema.TRetentionPolicy.scope, 'installation'),
        eq(schema.TRetentionPolicy.status, 'active'),
      ),
    )
    .limit(1)
    .all()[0]
  return row === undefined
    ? undefined
    : {
        id: row.id,
        version: row.version,
        policy: toPolicy(row),
        updatedAt: row.updatedAt,
      }
}

function selectMaxInstallationVersion(tx: SqliteTransaction, installationId: string): number {
  const row = tx
    .select({ version: schema.TRetentionPolicy.version })
    .from(schema.TRetentionPolicy)
    .where(
      and(
        eq(schema.TRetentionPolicy.installationId, installationId),
        eq(schema.TRetentionPolicy.scope, 'installation'),
      ),
    )
    .orderBy(desc(schema.TRetentionPolicy.version))
    .limit(1)
    .all()[0]
  return row?.version ?? 0
}

function selectMaxSiteVersion(
  tx: SqliteTransaction,
  installationId: string,
  siteId: string,
): number {
  const row = tx
    .select({ version: schema.TRetentionPolicy.version })
    .from(schema.TRetentionPolicy)
    .where(
      and(
        eq(schema.TRetentionPolicy.installationId, installationId),
        eq(schema.TRetentionPolicy.siteId, siteId),
        eq(schema.TRetentionPolicy.scope, 'site'),
      ),
    )
    .orderBy(desc(schema.TRetentionPolicy.version))
    .limit(1)
    .all()[0]
  return row?.version ?? 0
}

function selectActiveSitePolicy(tx: SqliteTransaction, installationId: string, siteId: string) {
  const row = tx
    .select()
    .from(schema.TRetentionPolicy)
    .where(
      and(
        eq(schema.TRetentionPolicy.installationId, installationId),
        eq(schema.TRetentionPolicy.siteId, siteId),
        eq(schema.TRetentionPolicy.scope, 'site'),
        eq(schema.TRetentionPolicy.status, 'active'),
      ),
    )
    .limit(1)
    .all()[0]
  return row === undefined
    ? undefined
    : {
        id: row.id,
        version: row.version,
        policy: toPolicy(row),
        updatedAt: row.updatedAt,
      }
}

function supersedePolicy(tx: SqliteTransaction, policyId: string, now: Date): void {
  tx.update(schema.TRetentionPolicy)
    .set({ status: 'superseded', effectiveTo: now, updatedAt: now })
    .where(
      and(eq(schema.TRetentionPolicy.id, policyId), eq(schema.TRetentionPolicy.status, 'active')),
    )
    .run()
}

function toPolicy(
  row: typeof schema.TRetentionPolicy.$inferSelect,
): RetentionPolicyRepository.Policy {
  return {
    eventMonths: row.eventMonths,
    profileMonths: row.profileMonths,
    replayMonths: row.replayMonths,
  }
}

function selectActiveSite(tx: SqliteTransaction, siteId: string) {
  return tx
    .select()
    .from(schema.TSite)
    .where(and(eq(schema.TSite.id, siteId), eq(schema.TSite.status, 'active')))
    .limit(1)
    .all()[0]
}

function selectActiveSites(tx: SqliteTransaction) {
  return tx.select().from(schema.TSite).where(eq(schema.TSite.status, 'active')).all()
}

function selectBoundary(tx: SqliteTransaction, siteId: string) {
  return tx
    .select()
    .from(schema.TRetentionEffectiveCutoff)
    .where(eq(schema.TRetentionEffectiveCutoff.siteId, siteId))
    .limit(1)
    .all()[0]
}

function selectResolved(
  tx: SqliteTransaction,
  installation: typeof schema.TInstallation.$inferSelect,
  siteId: string | null,
): RetentionPolicyRepository.StoredResolution {
  const installationPolicy = selectActiveInstallationPolicy(tx, installation.id)
  const installationDefault = installationPolicy?.policy ?? { ...DEFAULT_POLICY }
  const sitePolicy =
    siteId === null ? undefined : selectActiveSitePolicy(tx, installation.id, siteId)
  return {
    installationId: installation.id,
    installationDefault,
    siteOverride: sitePolicy?.policy ?? null,
    effectivePolicy: { ...(sitePolicy?.policy ?? installationDefault) },
    cleanup: toCleanupSummary(installation),
    updatedAt: (
      sitePolicy?.updatedAt ??
      installationPolicy?.updatedAt ??
      installation.updatedAt
    ).toISOString(),
  }
}

function createBoundary(input: {
  site: typeof schema.TSite.$inferSelect
  installationId: string
  policyId: string
  policy: RetentionPolicyRepository.Policy
  now: Date
}): RetentionPolicyRepository.SiteRetentionBoundary {
  return {
    siteId: input.site.id,
    installationId: input.installationId,
    policyId: input.policyId,
    reportingTimezone: input.site.reportingTimezone,
    localDay: resolveSiteLocalDay({ now: input.now, timeZone: input.site.reportingTimezone }),
    eventOccurrenceCutoffAt: resolveSiteLocalCutoff({
      now: input.now,
      timeZone: input.site.reportingTimezone,
      retentionMonths: input.policy.eventMonths,
    }),
    rawReceiptCutoffAt: resolveSiteLocalCutoff({
      now: input.now,
      timeZone: input.site.reportingTimezone,
      retentionMonths: input.policy.eventMonths,
    }),
    profileActivityCutoffAt: resolveSiteLocalCutoff({
      now: input.now,
      timeZone: input.site.reportingTimezone,
      retentionMonths: input.policy.profileMonths,
    }),
    replayReceiptCutoffAt:
      input.policy.replayMonths === null
        ? null
        : resolveSiteLocalCutoff({
            now: input.now,
            timeZone: input.site.reportingTimezone,
            retentionMonths: input.policy.replayMonths,
          }),
    effectiveAt: input.now,
    updatedAt: input.now,
  }
}

function upsertBoundary(
  tx: SqliteTransaction,
  boundary: RetentionPolicyRepository.SiteRetentionBoundary,
): void {
  tx.insert(schema.TRetentionEffectiveCutoff)
    .values(boundary)
    .onConflictDoUpdate({
      target: schema.TRetentionEffectiveCutoff.siteId,
      set: boundary,
    })
    .run()
}

function shouldQueueCleanup(
  previous: typeof schema.TRetentionEffectiveCutoff.$inferSelect | undefined,
  next: RetentionPolicyRepository.SiteRetentionBoundary,
): boolean {
  if (previous === undefined) return true
  return (
    next.eventOccurrenceCutoffAt > previous.eventOccurrenceCutoffAt ||
    next.rawReceiptCutoffAt > previous.rawReceiptCutoffAt ||
    next.profileActivityCutoffAt > previous.profileActivityCutoffAt ||
    (next.replayReceiptCutoffAt !== null &&
      (previous.replayReceiptCutoffAt === null ||
        next.replayReceiptCutoffAt > previous.replayReceiptCutoffAt))
  )
}

const CLEANUP_DATA_CLASSES = [
  'accepted-events',
  'raw-event-payloads',
  'acceptance-journal',
  'sessions',
  'visitors',
  'goals',
  'funnels',
  'cohorts',
  'profiles',
  'aliases',
  'traits',
  'identity-projections',
  'replay-material',
] as const

function queueCleanupRun(
  tx: SqliteTransaction,
  boundary: RetentionPolicyRepository.SiteRetentionBoundary,
  kind: 'derived' | 'backup',
  now: Date,
): string {
  const active = tx
    .select()
    .from(schema.TRetentionCleanupRun)
    .where(
      and(
        eq(schema.TRetentionCleanupRun.installationId, boundary.installationId),
        eq(schema.TRetentionCleanupRun.siteId, boundary.siteId),
        eq(schema.TRetentionCleanupRun.cleanupKind, kind),
        // Failed work is retryable but does not prevent a new shortening run.
        eq(schema.TRetentionCleanupRun.status, 'queued'),
      ),
    )
    .limit(1)
    .all()[0]
  if (active !== undefined) {
    tx.update(schema.TRetentionCleanupRun)
      .set({
        policyId: boundary.policyId,
        eventOccurrenceCutoffAt: boundary.eventOccurrenceCutoffAt,
        rawReceiptCutoffAt: boundary.rawReceiptCutoffAt,
        profileActivityCutoffAt: boundary.profileActivityCutoffAt,
        replayReceiptCutoffAt: boundary.replayReceiptCutoffAt,
        updatedAt: now,
      })
      .where(eq(schema.TRetentionCleanupRun.id, active.id))
      .run()
    return active.id
  }

  const running = tx
    .select({ id: schema.TRetentionCleanupRun.id })
    .from(schema.TRetentionCleanupRun)
    .where(
      and(
        eq(schema.TRetentionCleanupRun.installationId, boundary.installationId),
        eq(schema.TRetentionCleanupRun.siteId, boundary.siteId),
        eq(schema.TRetentionCleanupRun.cleanupKind, kind),
        eq(schema.TRetentionCleanupRun.status, 'running'),
      ),
    )
    .limit(1)
    .all()[0]
  if (running !== undefined) return running.id

  const runId = generateId('rcl')
  tx.insert(schema.TRetentionCleanupRun)
    .values({
      id: runId,
      installationId: boundary.installationId,
      siteId: boundary.siteId,
      policyId: boundary.policyId,
      cleanupKind: kind,
      status: 'queued',
      eventOccurrenceCutoffAt: boundary.eventOccurrenceCutoffAt,
      rawReceiptCutoffAt: boundary.rawReceiptCutoffAt,
      profileActivityCutoffAt: boundary.profileActivityCutoffAt,
      replayReceiptCutoffAt: boundary.replayReceiptCutoffAt,
      startedAt: null,
      completedAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    })
    .run()
  for (const dataClass of CLEANUP_DATA_CLASSES) {
    tx.insert(schema.TRetentionCleanupCheckpoint)
      .values({
        id: generateId('rck'),
        cleanupRunId: runId,
        dataClass,
        stage: kind,
        cursor: null,
        processedThrough: null,
        status: 'pending',
        updatedAt: now,
      })
      .run()
  }
  return runId
}

function redactExpiredProfiles(
  tx: SqliteTransaction,
  boundary: RetentionPolicyRepository.SiteRetentionBoundary,
  now: Date,
): void {
  const profiles = tx
    .select()
    .from(schema.TIdentityProfile)
    .where(
      and(
        eq(schema.TIdentityProfile.siteId, boundary.siteId),
        eq(schema.TIdentityProfile.status, 'active'),
        lt(schema.TIdentityProfile.lastSeenAt, boundary.profileActivityCutoffAt),
      ),
    )
    .all()
  for (const profile of profiles) {
    const epoch = tx
      .select()
      .from(schema.TIdentityProfileEpoch)
      .where(
        and(
          eq(schema.TIdentityProfileEpoch.profileId, profile.profileId),
          eq(schema.TIdentityProfileEpoch.status, 'active'),
        ),
      )
      .limit(1)
      .all()[0]
    if (epoch === undefined) continue
    const existing = tx
      .select({ reason: schema.TIdentityRedaction.reason })
      .from(schema.TIdentityRedaction)
      .where(
        and(
          eq(schema.TIdentityRedaction.siteId, boundary.siteId),
          eq(schema.TIdentityRedaction.identifiedUserId, profile.identifiedUserId),
          eq(schema.TIdentityRedaction.profileEpoch, epoch.epoch),
        ),
      )
      .limit(1)
      .all()[0]
    if (existing?.reason === 'explicit') continue
    tx.insert(schema.TIdentityRedaction)
      .values({
        id: generateId('ird'),
        siteId: boundary.siteId,
        profileId: profile.profileId,
        identifiedUserId: profile.identifiedUserId,
        profileEpoch: epoch.epoch,
        reason: 'retention',
        status: 'requested',
        requestedAt: now,
        appliedAt: null,
        derivedCleanupStatus: 'pending',
        backupCleanupStatus: 'pending',
        derivedCleanupUpdatedAt: now,
        backupCleanupUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .run()
    tx.update(schema.TIdentityProfile)
      .set({ status: 'deletion-requested', updatedAt: now })
      .where(
        and(
          eq(schema.TIdentityProfile.profileId, profile.profileId),
          eq(schema.TIdentityProfile.status, 'active'),
        ),
      )
      .run()
  }
}

function markCleanupPending(tx: SqliteTransaction, installationId: string, now: Date): void {
  const installation = selectInstallation(tx)
  if (installation === undefined || installation.id !== installationId) {
    throw new Error('Installation disappeared while queuing retention cleanup')
  }
  const derivedRunning = installation.derivedCleanupStatus === 'running'
  const backupRunning = installation.backupCleanupStatus === 'running'
  tx.update(schema.TInstallation)
    .set({
      cleanupPending: true,
      derivedCleanupStatus: derivedRunning ? 'running' : 'pending',
      derivedCleanupStartedAt: derivedRunning ? installation.derivedCleanupStartedAt : null,
      derivedCleanupCompletedAt: derivedRunning ? installation.derivedCleanupCompletedAt : null,
      derivedCleanupErrorCode: null,
      backupCleanupStatus: backupRunning ? 'running' : 'pending',
      backupCleanupStartedAt: backupRunning ? installation.backupCleanupStartedAt : null,
      backupCleanupCompletedAt: backupRunning ? installation.backupCleanupCompletedAt : null,
      backupCleanupErrorCode: null,
      updatedAt: now,
    })
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .run()
}

function selectNextRun(tx: SqliteTransaction, kind: 'derived' | 'backup') {
  return tx
    .select()
    .from(schema.TRetentionCleanupRun)
    .where(
      and(
        eq(schema.TRetentionCleanupRun.cleanupKind, kind),
        inArray(schema.TRetentionCleanupRun.status, ['queued', 'failed']),
      ),
    )
    .orderBy(asc(schema.TRetentionCleanupRun.createdAt), asc(schema.TRetentionCleanupRun.id))
    .limit(1)
    .all()[0]
}

function selectNextBackupRun(tx: SqliteTransaction) {
  const blocked = tx
    .select({ id: schema.TRetentionCleanupRun.id })
    .from(schema.TRetentionCleanupRun)
    .where(
      and(
        eq(schema.TRetentionCleanupRun.cleanupKind, 'derived'),
        notInArray(schema.TRetentionCleanupRun.status, ['succeeded', 'cancelled']),
      ),
    )
    .limit(1)
    .all()[0]
  return blocked === undefined ? selectNextRun(tx, 'backup') : undefined
}

function toBoundary(
  row: typeof schema.TRetentionEffectiveCutoff.$inferSelect,
): RetentionPolicyRepository.SiteRetentionBoundary {
  return {
    siteId: row.siteId,
    installationId: row.installationId,
    policyId: row.policyId,
    reportingTimezone: row.reportingTimezone,
    localDay: row.localDay,
    eventOccurrenceCutoffAt: row.eventOccurrenceCutoffAt,
    rawReceiptCutoffAt: row.rawReceiptCutoffAt,
    profileActivityCutoffAt: row.profileActivityCutoffAt,
    replayReceiptCutoffAt: row.replayReceiptCutoffAt,
    effectiveAt: row.effectiveAt,
    updatedAt: row.updatedAt,
  }
}

function toCleanupCheckpoint(
  row: typeof schema.TRetentionCleanupCheckpoint.$inferSelect,
): RetentionPolicyRepository.CleanupCheckpoint {
  return {
    id: row.id,
    dataClass: row.dataClass,
    stage: row.stage,
    cursor: row.cursor,
    processedThrough: row.processedThrough,
    status: row.status,
    updatedAt: row.updatedAt,
  }
}

function markCleanupStageRunning(
  tx: SqliteTransaction,
  kind: 'derived' | 'backup',
  now: Date,
): void {
  const installation = selectInstallation(tx)
  if (installation === undefined) throw new Error('Installation disappeared while claiming cleanup')
  const fields =
    kind === 'derived'
      ? {
          derivedCleanupStatus: 'running' as const,
          derivedCleanupStartedAt: installation.derivedCleanupStartedAt ?? now,
          derivedCleanupCompletedAt: null,
          derivedCleanupErrorCode: null,
        }
      : {
          backupCleanupStatus: 'running' as const,
          backupCleanupStartedAt: installation.backupCleanupStartedAt ?? now,
          backupCleanupCompletedAt: null,
          backupCleanupErrorCode: null,
        }
  tx.update(schema.TInstallation)
    .set({ ...fields, cleanupPending: true, updatedAt: now })
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .run()
}

function recomputeCleanupStatus(
  tx: SqliteTransaction,
  now: Date,
  failureCode: 'CLEANUP_FAILED' | null = null,
): void {
  const installation = selectInstallation(tx)
  if (installation === undefined)
    throw new Error('Installation disappeared while completing cleanup')
  const runs = tx.select().from(schema.TRetentionCleanupRun).all()
  const derived = summarizeCleanupStage(runs, 'derived', now, failureCode)
  const backup = summarizeCleanupStage(runs, 'backup', now, failureCode)
  const pending =
    (derived.status !== 'not_applicable' && derived.status !== 'completed') ||
    (backup.status !== 'not_applicable' && backup.status !== 'completed')
  tx.update(schema.TInstallation)
    .set({
      cleanupPending: pending,
      derivedCleanupStatus: derived.status,
      derivedCleanupStartedAt: derived.startedAt,
      derivedCleanupCompletedAt: derived.completedAt,
      derivedCleanupErrorCode: derived.errorCode,
      backupCleanupStatus: backup.status,
      backupCleanupStartedAt: backup.startedAt,
      backupCleanupCompletedAt: backup.completedAt,
      backupCleanupErrorCode: backup.errorCode,
      updatedAt: now,
    })
    .where(eq(schema.TInstallation.singletonKey, 'default'))
    .run()
  void installation
}

function summarizeCleanupStage(
  runs: Array<typeof schema.TRetentionCleanupRun.$inferSelect>,
  kind: 'derived' | 'backup',
  now: Date,
  failureCode: 'CLEANUP_FAILED' | null,
): {
  status: 'not_applicable' | 'not_started' | 'pending' | 'running' | 'completed' | 'failed'
  startedAt: Date | null
  completedAt: Date | null
  errorCode: string | null
} {
  const stageRuns = runs.filter((run) => run.cleanupKind === kind)
  if (stageRuns.length === 0) {
    return { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null }
  }
  if (stageRuns.some((run) => run.status === 'running')) {
    return {
      status: 'running',
      startedAt: stageRuns.find((run) => run.startedAt !== null)?.startedAt ?? now,
      completedAt: null,
      errorCode: null,
    }
  }
  const failed = stageRuns.find((run) => run.status === 'failed')
  if (failed !== undefined) {
    return {
      status: 'failed',
      startedAt: failed.startedAt ?? now,
      completedAt: failed.completedAt ?? now,
      errorCode: failureCode ?? 'CLEANUP_FAILED',
    }
  }
  if (stageRuns.some((run) => run.status === 'queued')) {
    return { status: 'pending', startedAt: null, completedAt: null, errorCode: null }
  }
  return {
    status: 'completed',
    startedAt: stageRuns.find((run) => run.startedAt !== null)?.startedAt ?? now,
    completedAt:
      stageRuns
        .map((run) => run.completedAt)
        .filter((value): value is Date => value !== null)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? now,
    errorCode: null,
  }
}

function toCleanupSummary(
  row: typeof schema.TInstallation.$inferSelect,
): RetentionPolicyRepository.CleanupSummary {
  return {
    pending: row.cleanupPending,
    derived: {
      status: row.derivedCleanupStatus,
      startedAt: row.derivedCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.derivedCleanupCompletedAt?.toISOString() ?? null,
      errorCode: parseErrorCode(row.derivedCleanupErrorCode),
    },
    backup: {
      status: row.backupCleanupStatus,
      startedAt: row.backupCleanupStartedAt?.toISOString() ?? null,
      completedAt: row.backupCleanupCompletedAt?.toISOString() ?? null,
      errorCode: parseErrorCode(row.backupCleanupErrorCode),
    },
  }
}

function parseErrorCode(value: string | null): RetentionPolicyRepository.CleanupStage['errorCode'] {
  return value === null ? null : parse(contractSchema.SLifecycleErrorCode, value)
}
