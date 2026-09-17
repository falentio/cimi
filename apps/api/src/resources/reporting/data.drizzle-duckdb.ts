import { schema as contractSchema } from '@cimi/contract'
import { type AnalyticsDb, type Db } from '@cimi/db'
import { parse } from 'valibot'
import type { ReportDataPort } from './query.ts'
import type { ReportSnapshot } from './model.ts'
import { readActiveProfiles } from './profiles.ts'

export interface ReportingDataDrizzleDuckDbDependencies {
  readonly db: Db
  readonly analytics: AnalyticsDb
}

export class ReportingDataDrizzleDuckDb implements ReportDataPort {
  constructor(private readonly deps: ReportingDataDrizzleDuckDbDependencies) {}

  async read(input: Parameters<ReportDataPort['read']>[0]): Promise<ReportSnapshot> {
    const data = await this.deps.analytics.readReportData({
      siteId: input.siteId,
      from: new Date(input.from),
      toExclusive: new Date(input.toExclusive),
    })
    return {
      events: data.events.map((event) => ({
        ...event,
        eventKind: parse(contractSchema.SEventKind, event.eventKind),
      })),
      sessions: data.sessions,
      activeProfiles: readActiveProfiles(this.deps.db, input.siteId),
    }
  }
}
