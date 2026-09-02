import { and, eq } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'

export async function isOwnerInvariantValid(db: Db, organizationId: string): Promise<boolean> {
  const organizations = await db
    .select({ ownerUserId: schema.TOrganization.ownerUserId })
    .from(schema.TOrganization)
    .where(eq(schema.TOrganization.id, organizationId))
    .limit(1)
  const organization = organizations[0]
  if (organization === undefined) return false

  const owners = await db
    .select({ userId: schema.TMembership.userId })
    .from(schema.TMembership)
    .where(
      and(
        eq(schema.TMembership.organizationId, organizationId),
        eq(schema.TMembership.role, 'owner'),
      ),
    )
  return owners.length === 1 && owners[0]?.userId === organization.ownerUserId
}
