import { call } from '@orpc/server'
import { expect, test } from 'vitest'
import { createApiE2eFixture } from './fixture.ts'

const REPORT_DATE = new Date().toISOString().slice(0, 10)
const PAGE_VIEW_TIME = `${REPORT_DATE}T00:00:00.000Z`
const CUSTOM_EVENT_TIME = `${REPORT_DATE}T00:00:30.000Z`

test('projects public ingestion into traffic and event reports through the file-backed stores', async () => {
  await using fixture = await createApiE2eFixture()
  const owner = await fixture.createUser('reporting-owner@example.com', 'Reporting Owner')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await owner.context() },
  )
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Reporting Organization' },
    { context: await owner.context() },
  )
  const site = await call(
    fixture.router.site.createSite,
    { organizationId: organization.id, name: 'Production', hostname: 'reporting.example.com' },
    { context: await owner.context() },
  )
  await call(
    fixture.router.retentionPolicy.updateRetentionPolicy,
    {
      scope: 'installation',
      policy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    },
    { context: await owner.context() },
  )

  const accepted = await call(
    fixture.router.eventIngestion.collectEvent,
    {
      eventId: 'evt_reporting_page_view',
      ingestionIdentifier: site.ingestionIdentifier,
      kind: 'page_view',
      pagePath: '/pricing',
      occurrenceTime: PAGE_VIEW_TIME,
      anonymousIdentityId: 'anonymous_reporting',
    },
    { context: fixture.unauthenticatedContext() },
  )
  expect(accepted.status).toBe('accepted')
  await expect(
    call(
      fixture.router.eventIngestion.collectEvent,
      {
        eventId: 'evt_reporting_custom',
        ingestionIdentifier: site.ingestionIdentifier,
        kind: 'custom_event',
        name: 'signup',
        occurrenceTime: CUSTOM_EVENT_TIME,
        anonymousIdentityId: 'anonymous_reporting',
      },
      { context: fixture.unauthenticatedContext() },
    ),
  ).resolves.toMatchObject({ status: 'accepted' })
  await fixture.analytics.rebuild()

  const goal = await call(
    fixture.router.goal.createGoal,
    {
      siteId: site.id,
      name: 'Signup',
      action: { kind: 'custom_event', name: 'signup' },
      identityKind: 'visitor',
    },
    { context: await owner.context() },
  )
  const funnel = await call(
    fixture.router.funnel.createFunnel,
    {
      siteId: site.id,
      name: 'Pricing signup',
      steps: [{ kind: 'page_view' }, { kind: 'custom_event', name: 'signup' }],
      identityKind: 'visitor',
    },
    { context: await owner.context() },
  )
  const cohort = await call(
    fixture.router.cohortRetention.createCohort,
    {
      siteId: site.id,
      name: 'Pricing return',
      entryAction: { kind: 'page_view' },
      retentionAction: { kind: 'custom_event', name: 'signup' },
      identityKind: 'visitor',
      period: 'day',
    },
    { context: await owner.context() },
  )

  await expect(
    call(
      fixture.router.trafficReport.getTrafficOverview,
      {
        siteId: site.id,
        fromDate: REPORT_DATE,
        toDate: REPORT_DATE,
        granularity: 'day',
      },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({
    fromDate: REPORT_DATE,
    toDate: REPORT_DATE,
    visitors: 1,
    sessions: 1,
    pageviews: 1,
    trend: [expect.objectContaining({ value: 1 })],
  })
  await expect(
    call(
      fixture.router.eventReport.getEventOverview,
      { siteId: site.id, eventKind: 'custom_event', fromDate: REPORT_DATE, toDate: REPORT_DATE },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({
    eventKind: 'custom_event',
    total: 1,
    uniqueVisitors: 1,
    uniqueSessions: 1,
  })
  await expect(
    call(
      fixture.router.eventReport.getEventTimeseries,
      {
        siteId: site.id,
        eventKind: 'page_view',
        fromDate: REPORT_DATE,
        toDate: REPORT_DATE,
        granularity: 'day',
      },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({
    buckets: [expect.objectContaining({ count: 1 })],
  })
  await expect(
    call(
      fixture.router.goal.getGoalReport,
      { goalId: goal.id, fromDate: REPORT_DATE, toDate: REPORT_DATE },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({ conversions: 1, eligibleSessions: 1, conversionRate: 1 })
  await expect(
    call(
      fixture.router.funnel.getFunnelReport,
      { funnelId: funnel.id, fromDate: REPORT_DATE, toDate: REPORT_DATE },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({
    steps: [
      expect.objectContaining({ index: 0, matched: 1 }),
      expect.objectContaining({ index: 1, matched: 1 }),
    ],
  })
  await expect(
    call(
      fixture.router.cohortRetention.getRetentionReport,
      { cohortId: cohort.id, fromDate: REPORT_DATE, toDate: REPORT_DATE },
      { context: await owner.context() },
    ),
  ).resolves.toMatchObject({
    periods: [expect.objectContaining({ index: 0, size: 1, retained: 1, rate: 1 })],
  })
}, 15_000)
