import { expect, test } from 'vitest'
import { parse } from 'valibot'
import type { JsonValue } from '@cimi/utils'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { InMemoryLifecycleLock } from '@cimi/kernel'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'
import { createOwnerSite, readyLifecycle, seedAcceptedEvents } from './reporting-fixture.ts'
import type { ApiApp } from '../index.ts'

const DAY_ONE = '2026-09-05'

const DAY_TWO = '2026-09-06'

async function createOwnedSite(app: ApiApp, email: string, hostname: string) {
  const owner = await signUpTestUser(app, email, 'Fail Closed Owner')

  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )

  expect(initialized.status, await initialized.clone().text()).toBe(201)

  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: 'Fail Closed Org' },
  )

  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())

  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname,
  })

  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)

  return { owner, site: parse(schema.SSiteCreateOutput, await siteResponse.json()) }
}

function eventFor(ingestionIdentifier: string, eventId: string) {
  return { eventId, ingestionIdentifier, kind: 'custom_event', name: 'checkout_completed' }
}

function overviewPath(siteId: string): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day`
}

function publicDashboardQueryPath(identifier: string): string {
  const url = new URL('http://localhost/api/public-dashboard/queryPublicDashboard')
  url.search = new URLSearchParams({
    publicDashboardIdentifier: identifier,
    fromDate: DAY_ONE,
    toDate: DAY_ONE,
    granularity: 'hour',
    metric: 'pageviews',
    dimension: 'page',
  }).toString()

  return url.toString()
}

async function enablePublicDashboard(app: ApiApp, cookie: string, siteId: string): Promise<string> {
  const enabled = await apiTestRequest(app, '/public-dashboard/enablePublicDashboard', cookie, {
    siteId,
  })

  expect(enabled.status, await enabled.clone().text()).toBe(200)

  const { publicDashboardIdentifier } = await enabled.json()

  return publicDashboardIdentifier
}

async function textOf(response: Response): Promise<string> {
  return await response.clone().text()
}

test('deleting a site drains a pre-admitted candidate then fails closed across every path', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture

  const { owner, site } = await createOwnedSite(
    app,
    'delete-drain@example.com',
    'drain.example.com',
  )

  const publicDashboardIdentifier = await enablePublicDashboard(app, owner.cookie, site.id)

  const inFlight = apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_pre_admitted'),
  )

  // The per-Db lifecycle lock serializes ingestion against lifecycle mutations: a fire-and-forget
  // collection holds the ingestion lease until its coalescer flush commits, so a concurrent delete
  // is refused with CONFLICT rather than racing the in-flight candidate.
  const contended = await apiTestRequest(app, '/site/deleteSite', owner.cookie, {
    siteId: site.id,
  })

  expect(contended.status, await contended.clone().text()).toBe(409)
  await expect(contended.json()).resolves.toMatchObject({ code: 'CONFLICT', status: 409 })

  const drained = await inFlight
  expect(drained.status, await textOf(drained)).toBe(200)
  await expect(drained.clone().json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: 'event_pre_admitted',
  })

  // SAFETY: better-sqlite3 returns any; single event_id column selected below.
  const rows = db.$client.prepare('SELECT event_id FROM accepted_event').all() as Array<{
    event_id: string
  }>

  expect(rows.map((row) => row.event_id)).toContain('event_pre_admitted')

  const names = [site.name, site.hostname, site.ingestionIdentifier]

  const deletion = await apiTestRequest(app, '/site/deleteSite', owner.cookie, { siteId: site.id })
  expect(deletion.status, await textOf(deletion)).toBe(202)
  await expect(deletion.json()).resolves.toMatchObject({
    accepted: true,
    status: 'deleting',
  })

  const collect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_after_delete'),
  )

  expect(collect.status, await textOf(collect)).toBe(404)
  const collectText = await textOf(collect)
  await expect(collect.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(collectText, collectText).not.toContain(leaked)

  const identify = await apiTestRequest(app, '/identity-profile/identify', '', {
    ingestionIdentifier: site.ingestionIdentifier,
    identifiedUserId: 'app-user-delete',
  })

  expect(identify.status, await textOf(identify)).toBe(404)
  const identifyText = await textOf(identify)
  await expect(identify.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(identifyText, identifyText).not.toContain(leaked)

  const list = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
    owner.cookie,
  )

  expect(list.status, await textOf(list)).toBe(404)
  const listText = await textOf(list)
  await expect(list.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(listText, listText).not.toContain(leaked)

  // A report read fails closed on site scope resolution: the deleting Site is no longer active, so
  // the read is refused before admission. The same request on an active Site returns 200 (asserted
  // in the held-lease test below), so 404 here is a real fail-closed transition.
  const report = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
  const reportText = await textOf(report)
  expect(report.status, reportText).toBe(404)
  await expect(report.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(reportText, reportText).not.toContain(leaked)

  const publicRead = await app.fetch(
    new Request(publicDashboardQueryPath(publicDashboardIdentifier)),
    { transportPeerIp: '203.0.113.10' },
  )

  const publicText = await textOf(publicRead)
  expect(publicRead.status, publicText).toBe(404)
  await expect(publicRead.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(publicText, publicText).not.toContain(leaked)

  const get = await apiTestRequest(
    app,
    `/site/getSite?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )

  expect(get.status, await textOf(get)).toBe(404)
  const getText = await textOf(get)
  await expect(get.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(getText, getText).not.toContain(leaked)

  const deletionStatus = await apiTestRequest(
    app,
    `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )

  expect(deletionStatus.status, await deletionStatus.clone().text()).toBe(200)
  // SAFETY: route returns a JSON object; field assertions below verify the shape.
  const deletionStatusBody = (await deletionStatus.json()) as Record<string, JsonValue>
  expect(deletionStatusBody['siteId']).toBe(site.id)
  expect(['deleting', 'deleted']).toContain(deletionStatusBody['status'])
  expect(Object.keys(deletionStatusBody)).not.toContain('hostname')
  expect(Object.keys(deletionStatusBody)).not.toContain('ingestionIdentifier')
})

test('rotation fails closed for the retired ingestion identifier across collection and identity', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture

  const { owner, site } = await createOwnedSite(
    app,
    'rotate-failclosed@example.com',
    'rotate.example.com',
  )

  const oldIdentifier = site.ingestionIdentifier

  const rotated = await apiTestRequest(app, '/site/rotateIngestionIdentifier', owner.cookie, {
    siteId: site.id,
  })

  expect(rotated.status, await rotated.clone().text()).toBe(200)
  const rotatedSite = parse(schema.SSiteRotateIngestionOutput, await rotated.json())
  expect(rotatedSite.ingestionIdentifier).not.toBe(oldIdentifier)

  const oldCollect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(oldIdentifier, 'event_old_identifier'),
  )

  expect(oldCollect.status, await oldCollect.clone().text()).toBe(404)
  await expect(oldCollect.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  const oldIdentify = await apiTestRequest(app, '/identity-profile/identify', '', {
    ingestionIdentifier: oldIdentifier,
    identifiedUserId: 'app-user-old',
  })

  expect(oldIdentify.status, await oldIdentify.clone().text()).toBe(404)
  await expect(oldIdentify.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  const newCollect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(rotatedSite.ingestionIdentifier, 'event_new_identifier'),
  )

  expect(newCollect.status, await newCollect.clone().text()).toBe(200)
  await expect(newCollect.json()).resolves.toMatchObject({
    status: 'accepted',
    eventId: 'event_new_identifier',
  })

  const staleRows = db.$client
    .prepare('SELECT event_id FROM accepted_event WHERE event_id = ?')
    .all('event_old_identifier')

  expect(staleRows).toHaveLength(0)
})

test('a held site-deletion lease refuses an analytics read before execution', async () => {
  const lock = new InMemoryLifecycleLock()
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle(), lock })
  const { app, db, analytics } = fixture
  const { cookie, siteId } = await createOwnerSite(app, db, 'report-race@example.com')
  seedAcceptedEvents(db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'v1',
      kind: 'page_view',
      at: Date.parse(`${DAY_ONE}T10:00:00.000Z`),
      pagePath: '/',
    },
  ])
  await analytics.rebuild({ controlDb: db })

  const baseline = await apiTestRequest(app, overviewPath(siteId), cookie)
  expect(baseline.status, await baseline.clone().text()).toBe(200)

  const lease = lock.acquire('site_deletion')
  expect(lease, 'the deletion lease must be acquirable while no read is in flight').toBeDefined()

  const duringDeletion = await apiTestRequest(app, overviewPath(siteId), cookie)
  expect(duringDeletion.status, await duringDeletion.clone().text()).toBe(503)
  await expect(duringDeletion.json()).resolves.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
    status: 503,
  })

  await lease?.release()

  const afterRelease = await apiTestRequest(app, overviewPath(siteId), cookie)
  expect(afterRelease.status, await afterRelease.clone().text()).toBe(200)
  expect(afterRelease.status, 'the read recovers once the deletion lease releases').not.toBe(503)
})

test('purging a deleted site fails closed and keeps operation status observable without leaking', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture

  const { owner, site } = await createOwnedSite(
    app,
    'purge-failclosed@example.com',
    'purge.example.com',
  )

  const publicDashboardIdentifier = await enablePublicDashboard(app, owner.cookie, site.id)

  const collected = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_before_purge'),
  )

  expect(collected.status, await collected.clone().text()).toBe(200)

  const deletion = await apiTestRequest(app, '/site/deleteSite', owner.cookie, { siteId: site.id })
  expect(deletion.status, await deletion.clone().text()).toBe(202)

  // The worker transitions deleting -> deleted (setting purge_at one recovery window out).
  let deletedStatus: string | undefined

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const status = await apiTestRequest(
      app,
      `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
      owner.cookie,
    )

    expect(status.status, await status.clone().text()).toBe(200)
    deletedStatus = (await status.json()).status

    if (deletedStatus === 'deleted') break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  expect(deletedStatus, 'worker must complete the delete').toBe('deleted')

  // Force the recovery deadline into the past so the same worker picks the site up as a due purge.
  db.$client
    .prepare('UPDATE site SET purge_at = ?, recovery_deadline = ? WHERE id = ?')
    .run(Date.now() - 60_000, Date.now() - 60_000, site.id)

  let purgedStatus: string | undefined

  for (let attempt = 0; attempt < 400; attempt += 1) {
    const status = await apiTestRequest(
      app,
      `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
      owner.cookie,
    )

    expect(status.status, await status.clone().text()).toBe(200)
    purgedStatus = (await status.json()).status

    if (purgedStatus === 'purged') break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  expect(purgedStatus, 'worker must purge a due site').toBe('purged')

  const names = [site.name, site.hostname, site.ingestionIdentifier]

  const collect = await apiTestRequest(
    app,
    '/event-ingestion/collectEvent',
    '',
    eventFor(site.ingestionIdentifier, 'event_after_purge'),
  )

  expect(collect.status, await textOf(collect)).toBe(404)
  const collectText = await textOf(collect)
  await expect(collect.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(collectText, collectText).not.toContain(leaked)

  const identify = await apiTestRequest(app, '/identity-profile/identify', '', {
    ingestionIdentifier: site.ingestionIdentifier,
    identifiedUserId: 'app-user-purge',
  })

  expect(identify.status, await textOf(identify)).toBe(404)
  await expect(identify.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  const list = await apiTestRequest(
    app,
    `/identity-profile/listProfiles?siteId=${encodeURIComponent(site.id)}&limit=10&offset=0`,
    owner.cookie,
  )

  expect(list.status, await textOf(list)).toBe(404)
  await expect(list.json()).resolves.toMatchObject({ code: 'NOT_FOUND', status: 404 })

  // Purge holds the lifecycle lock while it runs, so a read arriving in the drain window is
  // refused with 503; once the lease releases, the tombstoned Site resolves to 404. Poll to the
  // settled state and assert the read was never served in between.
  let reportStatus: number | undefined
  let reportText = ''

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const report = await apiTestRequest(app, overviewPath(site.id), owner.cookie)
    reportText = await textOf(report)
    reportStatus = report.status
    expect(report.status, 'a purged Site must never serve a report').not.toBe(200)

    if (report.status === 404) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  expect(reportStatus, reportText).toBe(404)
  expect(JSON.parse(reportText), reportText).toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(reportText, reportText).not.toContain(leaked)

  let publicStatus: number | undefined
  let publicText = ''

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const publicRead = await app.fetch(
      new Request(publicDashboardQueryPath(publicDashboardIdentifier)),
      { transportPeerIp: '203.0.113.10' },
    )

    publicText = await textOf(publicRead)
    publicStatus = publicRead.status
    expect(publicRead.status, 'a purged Site must never serve a public dashboard').not.toBe(200)

    if (publicRead.status === 404) break
    await new Promise((resolve) => setTimeout(resolve, 10))
  }

  expect(publicStatus, publicText).toBe(404)
  expect(JSON.parse(publicText), publicText).toMatchObject({ code: 'NOT_FOUND', status: 404 })

  for (const leaked of names) expect(publicText, publicText).not.toContain(leaked)

  const deletionStatus = await apiTestRequest(
    app,
    `/site/getSiteDeletionStatus?siteId=${encodeURIComponent(site.id)}`,
    owner.cookie,
  )

  expect(deletionStatus.status, await deletionStatus.clone().text()).toBe(200)
  // SAFETY: route returns a JSON object; field assertions below verify the shape.
  const deletionStatusBody = (await deletionStatus.json()) as Record<string, JsonValue>
  expect(deletionStatusBody).toMatchObject({ siteId: site.id, status: 'purged' })
  expect(Object.keys(deletionStatusBody)).not.toContain('hostname')
  expect(Object.keys(deletionStatusBody)).not.toContain('ingestionIdentifier')
})
