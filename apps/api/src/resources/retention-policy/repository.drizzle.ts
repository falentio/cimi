import { and, desc, eq } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
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
      updatedAt: (
        siteRow?.updatedAt ??
        installationPolicy?.updatedAt ??
        installation.updatedAt
      ).toISOString(),
    }
  }

  async saveInstallationDefault(
    input: RetentionPolicyRepository.SaveInstallationDefaultInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    return this.db.transaction((tx) => {
      const installation = selectInstallation(tx)
      if (installation === undefined) throw new ORPCError('NOT_FOUND')
      const active = selectActiveInstallationPolicy(tx, installation.id)
      if (active !== undefined) {
        tx.update(schema.TRetentionPolicy)
          .set({ status: 'superseded', effectiveTo: input.now, updatedAt: input.now })
          .where(
            and(
              eq(schema.TRetentionPolicy.id, active.id),
              eq(schema.TRetentionPolicy.status, 'active'),
            ),
          )
          .run()
      }
      tx.insert(schema.TRetentionPolicy)
        .values({
          id: input.id,
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
          changedBy: null,
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
        .where(and(eq(schema.TInstallation.singletonKey, 'default')))
        .run()
      return {
        installationId: installation.id,
        installationDefault: { ...input.policy },
        siteOverride: null,
        effectivePolicy: { ...input.policy },
        updatedAt: input.now.toISOString(),
      }
    })
  }

  async saveSiteOverride(
    input: RetentionPolicyRepository.SaveSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    return this.db.transaction((tx) => {
      const installation = selectInstallation(tx)
      if (installation === undefined) throw new ORPCError('NOT_FOUND')
      const active = selectActiveSitePolicy(tx, installation.id, input.siteId)
      if (active !== undefined) {
        tx.update(schema.TRetentionPolicy)
          .set({ status: 'superseded', effectiveTo: input.now, updatedAt: input.now })
          .where(
            and(
              eq(schema.TRetentionPolicy.id, active.id),
              eq(schema.TRetentionPolicy.status, 'active'),
            ),
          )
          .run()
      }
      tx.insert(schema.TRetentionPolicy)
        .values({
          id: input.id,
          installationId: installation.id,
          siteId: input.siteId,
          scope: 'site',
          eventMonths: input.policy.eventMonths,
          profileMonths: input.policy.profileMonths,
          replayMonths: input.policy.replayMonths,
          version: selectMaxSiteVersion(tx, installation.id, input.siteId) + 1,
          status: 'active',
          effectiveFrom: input.now,
          effectiveTo: null,
          changedBy: null,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run()
      const installationDefault = selectActiveInstallationPolicy(tx, installation.id)?.policy ?? {
        ...DEFAULT_POLICY,
      }
      return {
        installationId: installation.id,
        installationDefault,
        siteOverride: { ...input.policy },
        effectivePolicy: { ...input.policy },
        updatedAt: input.now.toISOString(),
      }
    })
  }

  async clearSiteOverride(
    input: RetentionPolicyRepository.ClearSiteOverrideInput,
  ): Promise<RetentionPolicyRepository.StoredResolution> {
    return this.db.transaction((tx) => {
      const installation = selectInstallation(tx)
      if (installation === undefined) throw new ORPCError('NOT_FOUND')
      const active = selectActiveSitePolicy(tx, installation.id, input.siteId)
      if (active !== undefined) {
        tx.update(schema.TRetentionPolicy)
          .set({ status: 'superseded', effectiveTo: input.now, updatedAt: input.now })
          .where(
            and(
              eq(schema.TRetentionPolicy.id, active.id),
              eq(schema.TRetentionPolicy.status, 'active'),
            ),
          )
          .run()
      }
      const installationPolicy = selectActiveInstallationPolicy(tx, installation.id)
      const installationDefault = installationPolicy?.policy ?? {
        ...DEFAULT_POLICY,
      }
      return {
        installationId: installation.id,
        installationDefault,
        siteOverride: null,
        effectivePolicy: { ...installationDefault },
        updatedAt: (installationPolicy?.updatedAt ?? installation.updatedAt).toISOString(),
      }
    })
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
      }
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
