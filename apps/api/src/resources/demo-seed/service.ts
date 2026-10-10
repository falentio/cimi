import { and, eq } from 'drizzle-orm'
import { schema, type AnalyticsDb, type Db } from '@cimi/db'
import { DEMO_SITE_NAME } from '@cimi/kernel'
import { resolveSiteLocalCutoff } from '@cimi/utils'
import { generateEventFabric } from './fabric.ts'
import type { DemoSitePort, DemoSeedJournalPort, DemoSeedRetentionPort } from './ports.ts'

/** The demo window reaches back to the site creation date, which is the end of the window. */
const DEMO_HISTORY_DAYS = 90

const MS_PER_DAY = 86_400_000

/** The demo site is written with a UTC reporting timezone, so the horizon resolves in UTC. */
const DEMO_REPORTING_TIMEZONE = 'UTC'

/**
 * Rows this product writes against a site, cleared before the site row so a personal
 * organization that holds nothing but a demo site can still be deleted. A row the site owner
 * wrote themselves keeps blocking the delete, which is the behaviour the governance guard
 * exists for.
 */
const PIPELINE_SITE_TABLES = [
  schema.TRetentionEffectiveCutoff,
  schema.TProjectionCheckpoint,
  schema.TProjectionGap,
  schema.TRetentionCleanupRun,
  schema.TAcceptedEvent,
] as const

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

  async removeSeed(input: { readonly organizationId: string }): Promise<void> {
    const demoSites = this.#controlDb
      .select({ id: schema.TSite.id })
      .from(schema.TSite)
      .where(
        and(
          eq(schema.TSite.organizationId, input.organizationId),
          eq(schema.TSite.name, DEMO_SITE_NAME),
        ),
      )
      .all()

    for (const site of demoSites) {
      await this.#analytics.purgeSite({ siteId: site.id })
      this.#controlDb.transaction((tx) => {
        for (const table of PIPELINE_SITE_TABLES) {
          tx.delete(table).where(eq(table.siteId, site.id)).run()
        }

        tx.delete(schema.TSite).where(eq(schema.TSite.id, site.id)).run()
      })
    }
  }
}
