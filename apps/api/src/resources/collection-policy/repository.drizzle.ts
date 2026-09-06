import { and, desc, eq, isNull } from 'drizzle-orm'
import { schema as contractSchema } from '@cimi/contract'
import { schema, type Db } from '@cimi/db'
import { ORPCError } from '@orpc/server'
import { parse } from 'valibot'
import { resolvePolicy, type PolicyLayers, type PolicyRevision } from './model.ts'
import type { CollectionPolicyRepository } from './repository.ts'

export interface CollectionPolicyRepositoryDrizzleDependencies {
  readonly db: Db
}

export class CollectionPolicyRepositoryDrizzle implements CollectionPolicyRepository {
  private readonly db: Db

  constructor({ db }: CollectionPolicyRepositoryDrizzleDependencies) {
    this.db = db
  }

  async loadLayers(siteId: string): Promise<PolicyLayers> {
    const installation = await this.db
      .select({ id: schema.TInstallation.id })
      .from(schema.TInstallation)
      .where(eq(schema.TInstallation.singletonKey, 'default'))
      .limit(1)
    const installationRow = installation[0]
    if (installationRow === undefined) throw new ORPCError('NOT_FOUND')
    const installationRevision = await this.findCurrentInstallation(installationRow.id)
    if (installationRevision === undefined) throw new ORPCError('NOT_FOUND')
    const siteRevision = await this.findCurrentSite(installationRow.id, siteId)
    return {
      installation: toRevision(installationRevision),
      site: siteRevision === undefined ? null : toRevision(siteRevision),
    }
  }

  async commitRevision(
    input: CollectionPolicyRepository.CommitRevisionInput,
  ): Promise<CollectionPolicyRepository.CommitResult> {
    return this.db.transaction((tx) => {
      const installation = tx
        .select({ id: schema.TInstallation.id })
        .from(schema.TInstallation)
        .where(eq(schema.TInstallation.singletonKey, 'default'))
        .limit(1)
        .all()[0]
      if (installation === undefined) throw new ORPCError('NOT_FOUND')

      const values = parse(contractSchema.SPolicyValues, input.values)
      if (input.target.scope === 'site') {
        const site = tx
          .select({ id: schema.TSite.id })
          .from(schema.TSite)
          .where(and(eq(schema.TSite.id, input.target.siteId), eq(schema.TSite.status, 'active')))
          .limit(1)
          .all()[0]
        if (site === undefined) throw new ORPCError('NOT_FOUND')
      }

      const current = selectCurrentRevision(tx, installation.id, input.target)
      const effectiveFrom =
        current === undefined || input.now.getTime() > current.effectiveFrom.getTime()
          ? input.now
          : new Date(current.effectiveFrom.getTime() + 1)
      if (current !== undefined) {
        tx.update(schema.TCollectionPolicyRevision)
          .set({ effectiveTo: effectiveFrom })
          .where(
            and(
              eq(schema.TCollectionPolicyRevision.id, current.id),
              isNull(schema.TCollectionPolicyRevision.effectiveTo),
            ),
          )
          .run()
      }

      const version = selectNextVersion(tx, installation.id, input.target)
      tx.insert(schema.TCollectionPolicyRevision)
        .values({
          id: input.revisionId,
          installationId: installation.id,
          scope: input.target.scope,
          siteId: input.target.scope === 'site' ? input.target.siteId : null,
          version,
          policyJson: values,
          effectiveFrom,
          effectiveTo: null,
          committedAt: input.now,
          createdBy: input.changedBy,
          createdAt: input.now,
        })
        .run()

      const layers = selectLayers(
        tx,
        installation.id,
        input.target.scope === 'site' ? input.target.siteId : null,
      )
      return {
        layers,
        resolution:
          input.target.scope === 'site'
            ? resolvePolicy({ siteId: input.target.siteId, layers })
            : null,
      }
    })
  }

  private async findCurrentInstallation(installationId: string) {
    const rows = await this.db
      .select()
      .from(schema.TCollectionPolicyRevision)
      .where(
        and(
          eq(schema.TCollectionPolicyRevision.installationId, installationId),
          eq(schema.TCollectionPolicyRevision.scope, 'installation'),
          isNull(schema.TCollectionPolicyRevision.effectiveTo),
        ),
      )
      .limit(1)
    return rows[0]
  }

  private async findCurrentSite(installationId: string, siteId: string) {
    const rows = await this.db
      .select()
      .from(schema.TCollectionPolicyRevision)
      .where(
        and(
          eq(schema.TCollectionPolicyRevision.installationId, installationId),
          eq(schema.TCollectionPolicyRevision.scope, 'site'),
          eq(schema.TCollectionPolicyRevision.siteId, siteId),
          isNull(schema.TCollectionPolicyRevision.effectiveTo),
        ),
      )
      .limit(1)
    return rows[0]
  }
}

type SqliteTransaction = Parameters<Parameters<Db['transaction']>[0]>[0]

function selectCurrentRevision(
  tx: SqliteTransaction,
  installationId: string,
  target: CollectionPolicyRepository.CommitRevisionInput['target'],
) {
  return tx
    .select()
    .from(schema.TCollectionPolicyRevision)
    .where(
      and(
        eq(schema.TCollectionPolicyRevision.installationId, installationId),
        eq(schema.TCollectionPolicyRevision.scope, target.scope),
        target.scope === 'site'
          ? eq(schema.TCollectionPolicyRevision.siteId, target.siteId)
          : isNull(schema.TCollectionPolicyRevision.siteId),
        isNull(schema.TCollectionPolicyRevision.effectiveTo),
      ),
    )
    .limit(1)
    .all()[0]
}

function selectNextVersion(
  tx: SqliteTransaction,
  installationId: string,
  target: CollectionPolicyRepository.CommitRevisionInput['target'],
): number {
  const rows = tx
    .select({ version: schema.TCollectionPolicyRevision.version })
    .from(schema.TCollectionPolicyRevision)
    .where(
      and(
        eq(schema.TCollectionPolicyRevision.installationId, installationId),
        eq(schema.TCollectionPolicyRevision.scope, target.scope),
        target.scope === 'site'
          ? eq(schema.TCollectionPolicyRevision.siteId, target.siteId)
          : isNull(schema.TCollectionPolicyRevision.siteId),
      ),
    )
    .orderBy(desc(schema.TCollectionPolicyRevision.version))
    .limit(1)
    .all()
  return (rows[0]?.version ?? 0) + 1
}

function selectLayers(
  tx: SqliteTransaction,
  installationId: string,
  siteId: string | null,
): PolicyLayers {
  const installation = tx
    .select()
    .from(schema.TCollectionPolicyRevision)
    .where(
      and(
        eq(schema.TCollectionPolicyRevision.installationId, installationId),
        eq(schema.TCollectionPolicyRevision.scope, 'installation'),
        isNull(schema.TCollectionPolicyRevision.effectiveTo),
      ),
    )
    .limit(1)
    .all()[0]
  if (installation === undefined) throw new ORPCError('NOT_FOUND')
  const site =
    siteId === null
      ? undefined
      : tx
          .select()
          .from(schema.TCollectionPolicyRevision)
          .where(
            and(
              eq(schema.TCollectionPolicyRevision.installationId, installationId),
              eq(schema.TCollectionPolicyRevision.scope, 'site'),
              eq(schema.TCollectionPolicyRevision.siteId, siteId),
              isNull(schema.TCollectionPolicyRevision.effectiveTo),
            ),
          )
          .limit(1)
          .all()[0]
  return {
    installation: toRevision(installation),
    site: site === undefined ? null : toRevision(site),
  }
}

function toRevision(row: typeof schema.TCollectionPolicyRevision.$inferSelect): PolicyRevision {
  if (row.scope === 'site') {
    if (row.siteId === null) throw new Error('Site collection policy revision has no Site ID')
    return {
      id: row.id,
      version: row.version,
      target: { scope: 'site', siteId: row.siteId },
      values: parse(contractSchema.SPolicyValues, row.policyJson),
    }
  }
  return {
    id: row.id,
    version: row.version,
    target: { scope: 'installation' },
    values: parse(contractSchema.SPolicyValues, row.policyJson),
  }
}
