import { and, eq, notExists } from 'drizzle-orm'
import { schema, type Db } from '@cimi/db'
import type { ReportingMetadataPort, SiteId, SiteReportingMetadata } from '@cimi/kernel'

export interface ReportingMetadataDrizzleDependencies {
  readonly db: Db
}

export class ReportingMetadataDrizzle implements ReportingMetadataPort {
  constructor(private readonly deps: ReportingMetadataDrizzleDependencies) {}

  async getActive(siteId: SiteId): Promise<SiteReportingMetadata | undefined> {
    const rows = await this.deps.db
      .select({
        siteId: schema.TSite.id,
        reportingTimezone: schema.TSite.reportingTimezone,
        weekStartsOn: schema.TSite.weekStartsOn,
      })
      .from(schema.TSite)
      .where(
        and(
          eq(schema.TSite.id, siteId),
          eq(schema.TSite.status, 'active'),
          notExists(
            this.deps.db
              .select({ siteId: schema.TSiteTombstone.siteId })
              .from(schema.TSiteTombstone)
              .where(eq(schema.TSiteTombstone.siteId, schema.TSite.id)),
          ),
        ),
      )
      .limit(1)
    const row = rows[0]
    if (row === undefined) return undefined
    return {
      siteId: siteId,
      reportingTimezone: row.reportingTimezone,
      weekStartsOn: row.weekStartsOn,
    }
  }
}
