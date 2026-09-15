import { expect, test } from 'vitest'
import { schema as contractSchema } from '@cimi/contract'
import { apiTestRequest, createApiTestFixture } from '../../../testing/fixture.ts'
import {
  createOwnerSite,
  readyLifecycle,
  seedAcceptedEvents,
} from '../../../testing/reporting-fixture.ts'

const DAY_ONE = '2026-09-05'
const DAY_TWO = '2026-09-06'

function at(date: string, hour: number): number {
  return Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00.000Z`)
}

function overviewPath(siteId: string, extra = ''): string {
  return `/traffic-report/getTrafficOverview?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&granularity=day${extra}`
}

function traitFilter(field: string, value: string): string {
  return `&filters[0][scope]=profile&filters[0][field]=${encodeURIComponent(field)}&filters[0][operator]=equals&filters[0][values][0]=${encodeURIComponent(value)}`
}

function seedSitePolicyKeys(
  db: Parameters<typeof seedAcceptedEvents>[0],
  siteId: string,
  keys: readonly string[],
): void {
  const installation = db.$client
    .prepare('SELECT id FROM installation ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined
  if (installation === undefined) throw new Error('Seed a retention cutoff before seeding a policy')
  const now = Date.now()
  db.$client
    .prepare(
      `INSERT INTO collection_policy_revision (
         id, installation_id, scope, site_id, version, policy_json, effective_from, committed_at, created_at
       ) VALUES (?, ?, 'site', ?, 1, ?, ?, ?, ?)`,
    )
    .run(
      `cpr_site_${siteId}`,
      installation.id,
      siteId,
      JSON.stringify({ ...contractSchema.DEFAULT_COLLECTION_POLICY, profileFilterKeys: keys }),
      now,
      now,
      now,
    )
}

async function projectedSiteWithTrait(email: string, keys: readonly string[]) {
  const fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { cookie, siteId } = await createOwnerSite(fixture.app, fixture.db, email)
  seedAcceptedEvents(fixture.db, siteId, [
    { sessionId: 's1', visitorId: 'v1', kind: 'page_view', at: at(DAY_ONE, 10), pagePath: '/a' },
    { sessionId: 's2', visitorId: 'v2', kind: 'page_view', at: at(DAY_ONE, 11), pagePath: '/b' },
  ])
  seedSitePolicyKeys(fixture.db, siteId, keys)
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  return { fixture, cookie, siteId }
}

test('passes an approved profile trait filter through the gate, then reports it unsupported', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithTrait('trait-approved@example.com', [
    'plan',
  ])
  await using _ = fixture

  const response = await apiTestRequest(
    fixture.app,
    overviewPath(siteId, traitFilter('trait.plan', 'pro')),
    cookie,
  )

  // The gate approves trait.plan, so it is not rejected as unapproved. The projection carries no
  // trait dimension yet, so the adapter reports the filter unsupported rather than a transient 503.
  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
})

test('rejects an unapproved profile trait filter as BAD_REQUEST', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithTrait('trait-unapproved@example.com', [
    'plan',
  ])
  await using _ = fixture

  const response = await apiTestRequest(
    fixture.app,
    overviewPath(siteId, traitFilter('trait.secret', 'x')),
    cookie,
  )

  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
})

test('rejects any profile trait filter when the Site policy approves none', async () => {
  const { fixture, cookie, siteId } = await projectedSiteWithTrait('trait-none@example.com', [])
  await using _ = fixture

  const response = await apiTestRequest(
    fixture.app,
    overviewPath(siteId, traitFilter('trait.plan', 'pro')),
    cookie,
  )

  expect(response.status).toBe(400)
  await expect(response.json()).resolves.toMatchObject({ code: 'BAD_REQUEST', status: 400 })
})
