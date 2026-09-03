import { and, eq } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { SiteScopeGuardDependencies } from '@cimi/guard'
import { isOwnerInvariantValid } from '../organization/owner-invariant.ts'

export interface InvitationScopeDependencies {
  db: Db
}

export function createInvitationScopeDependencies({
  db,
}: InvitationScopeDependencies): Pick<SiteScopeGuardDependencies, 'membership'> {
  return {
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
