import type { AnalyticsDb, Db } from '@cimi/db'
import { resolveSiteLocalCutoff } from '@cimi/utils'
import { generateEventFabric } from './fabric.ts'
import type { DemoSitePort, DemoSeedJournalPort, DemoSeedRetentionPort } from './ports.ts'

/** The demo window reaches back to the site creation date, which is the end of the window. */
const DEMO_HISTORY_DAYS = 90

const MS_PER_DAY = 86_400_000

/** The demo site is written with a UTC reporting timezone, so the horizon resolves in UTC. */
const DEMO_REPORTING_TIMEZONE = 'UTC'

export interface DemoSeedServiceDependencies {
  readonly sites: DemoSitePort
  readonly journal: DemoSeedJournalPort
  readonly retention: DemoSeedRetentionPort
  readonly controlDb: Db
  readonly analytics: AnalyticsDb
  readonly clock?: () => Date
}

export interface DemoSeedInput {
  readonly organizationId: string
  readonly ownerUserId: string
}

export interface DemoSeedResult {
  readonly siteId: string
  readonly appendedEventCount: number
}

export class DemoSeedService {
  readonly #sites: DemoSitePort
  readonly #journal: DemoSeedJournalPort
  readonly #retention: DemoSeedRetentionPort
  readonly #controlDb: Db
  readonly #analytics: AnalyticsDb
  readonly #clock: () => Date

  constructor({
    sites,
    journal,
    retention,
    controlDb,
    analytics,
    clock,
  }: DemoSeedServiceDependencies) {
    this.#sites = sites
    this.#journal = journal
    this.#retention = retention
    this.#controlDb = controlDb
    this.#analytics = analytics
    this.#clock = clock ?? (() => new Date())
  }

  async seed(input: DemoSeedInput): Promise<DemoSeedResult> {
    const now = this.#clock()

    const site = await this.#sites.createDemoSite({
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
    })

    const policy = await this.#retention.effective(site.siteId)

    const horizon = resolveSiteLocalCutoff({
      now,
      timeZone: DEMO_REPORTING_TIMEZONE,
      retentionMonths: policy.eventMonths,
    })

    const events = generateEventFabric({
      siteId: site.siteId,
      from: new Date(Math.max(now.getTime() - DEMO_HISTORY_DAYS * MS_PER_DAY, horizon.getTime())),
      to: now,
    })

    const appendedEventCount = await this.#journal.appendGenerated({
      siteId: site.siteId,
      events,
    })

    await this.#analytics.appendProjectedEvents({ controlDb: this.#controlDb, siteId: site.siteId })

    return { siteId: site.siteId, appendedEventCount }
  }
}
