import { and, eq } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import { isOwnerInvariantValid } from '../organization/owner-invariant.ts'

export interface SiteScopeDependencies {
  db: Db
}

export function createSiteScopeDependencies({
  db,
}: SiteScopeDependencies): SiteScopeGuardDependencies {
  return {
    siteScope: {
      async exists(siteId) {
        const rows = await db
          .select({ id: schema.TSite.id })
          .from(schema.TSite)
          .where(eq(schema.TSite.id, siteId))
          .limit(1)
        if (rows.length > 0) return true
        const tombstones = await db
          .select({ siteId: schema.TSiteTombstone.siteId })
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, siteId))
          .limit(1)
        return tombstones.length > 0
      },
      async isActive(siteId) {
        const rows = await db
          .select({ id: schema.TSite.id })
          .from(schema.TSite)
          .where(and(eq(schema.TSite.id, siteId), eq(schema.TSite.status, 'active')))
          .limit(1)
        return rows.length > 0
      },
      async getOrganizationId(siteId) {
        const rows = await db
          .select({ organizationId: schema.TSite.organizationId })
          .from(schema.TSite)
          .where(eq(schema.TSite.id, siteId))
          .limit(1)
        if (rows[0] !== undefined) return rows[0].organizationId
        const tombstones = await db
          .select({ organizationId: schema.TSiteTombstone.organizationId })
          .from(schema.TSiteTombstone)
          .where(eq(schema.TSiteTombstone.siteId, siteId))
          .limit(1)
        return tombstones[0]?.organizationId
      },
    },
    membership: {
      async hasPendingGovernanceOperation(organizationId) {
        const governanceRows = await db
          .select({ id: schema.TOrganizationGovernanceOperation.id })
          .from(schema.TOrganizationGovernanceOperation)
          .where(
            and(
              eq(schema.TOrganizationGovernanceOperation.organizationId, organizationId),
              eq(schema.TOrganizationGovernanceOperation.status, 'pending'),
            ),
          )
          .limit(1)
        if (governanceRows.length > 0) return true

        const repairRows = await db
          .select({ id: schema.TOrganizationRepairOperation.id })
          .from(schema.TOrganizationRepairOperation)
          .where(
            and(
              eq(schema.TOrganizationRepairOperation.organizationId, organizationId),
              eq(schema.TOrganizationRepairOperation.status, 'pending'),
            ),
          )
          .limit(1)
        return repairRows.length > 0
      },
      async getRole(organizationId, userId) {
        if (!(await isOwnerInvariantValid(db, organizationId))) return undefined
        const rows = await db
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
      },
    },
  }
}
