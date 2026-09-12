import { expect, test } from 'vitest'
import type { Db } from '@cimi/db'
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

function listPath(siteId: string, kind: string): string {
  return `/event-report/listEvents?siteId=${encodeURIComponent(siteId)}&fromDate=${DAY_ONE}&toDate=${DAY_TWO}&eventKind=${kind}&direction=asc`
}

function seedIdentifiedProfile(db: Db, siteId: string): void {
  const now = Date.now() - 60_000
  db.$client
    .prepare(
      `INSERT INTO identity_profile (
         profile_id, site_id, identified_user_id, status, profile_epoch, traits,
         first_seen_at, last_seen_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'active', 1, NULL, ?, ?, ?, ?)`,
    )
    .run('profile-1', siteId, 'user-1', now, now, now, now)
  db.$client
    .prepare(
      `INSERT INTO identity_profile_epoch (
         profile_id, site_id, identified_user_id, epoch, status, started_at, ended_at, redacted_at
       ) VALUES (?, ?, ?, 1, 'active', ?, NULL, NULL)`,
    )
    .run('profile-1', siteId, 'user-1', now)
  db.$client
    .prepare(
      `INSERT INTO identity_link (
         id, site_id, profile_id, profile_epoch, anonymous_identity_id,
         analytics_session_id, effective_from, linked_at, unlinked_at
       ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL)`,
    )
    .run('link-1', siteId, 'profile-1', 'vis-1', 's1', now, now)
}

function markProfileRedacted(db: Db, siteId: string): void {
  const now = Date.now()
  db.$client
    .prepare(
      `INSERT INTO identity_redaction (
         id, site_id, profile_id, identified_user_id, profile_epoch, reason, status,
         requested_at, applied_at, derived_cleanup_status, backup_cleanup_status,
         derived_cleanup_updated_at, backup_cleanup_updated_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 1, 'explicit', 'requested', ?, NULL, 'pending', 'pending', NULL, NULL, ?, ?)`,
    )
    .run('redaction-1', siteId, 'profile-1', 'user-1', now, now, now)
}

async function projectedIdentifiedUserId(
  fixture: Awaited<ReturnType<typeof createApiTestFixture>>,
  siteId: string,
): Promise<unknown> {
  return fixture.analytics.readWindowed(async (reader) => {
    const rows = await reader.read(
      'SELECT identified_user_id AS identifiedUserId FROM events WHERE site_id = ?',
      [siteId],
    )
    return rows[0]?.['identifiedUserId']
  })
}

test('projects an identified event, then excludes a redacted profile while retaining the event as anonymous activity', async () => {
  await using fixture = await createApiTestFixture({ lifecycle: readyLifecycle() })
  const { cookie, siteId } = await createOwnerSite(
    fixture.app,
    fixture.db,
    'redacted-profile@example.com',
  )
  seedAcceptedEvents(fixture.db, siteId, [
    {
      sessionId: 's1',
      visitorId: 'vis-1',
      kind: 'page_view',
      at: at(DAY_ONE, 10),
      pagePath: '/checkout',
      identifiedUserId: 'user-1',
      anonymousIdentityId: 'vis-1',
      properties: { plan: 'pro' },
    },
  ])
  seedIdentifiedProfile(fixture.db, siteId)

  await fixture.analytics.rebuild({ controlDb: fixture.db })
  await expect(projectedIdentifiedUserId(fixture, siteId)).resolves.toBe('user-1')

  markProfileRedacted(fixture.db, siteId)
  await fixture.analytics.rebuild({ controlDb: fixture.db })
  await expect(projectedIdentifiedUserId(fixture, siteId)).resolves.toBeNull()

  const response = await apiTestRequest(fixture.app, listPath(siteId, 'page_view'), cookie)
  expect(response.status, await response.clone().text()).toBe(200)
  const body = await response.json()
  expect(body.items).toHaveLength(1)
  const item = body.items[0]
  expect(item).toMatchObject({ kind: 'page_view', pagePath: '/checkout' })
  expect(body.items[0]).not.toHaveProperty('identifiedUserId')
  expect(body.items[0]).not.toHaveProperty('profile')
  expect(body.items[0]).not.toHaveProperty('profileId')
  expect(body.items[0]).not.toHaveProperty('traits')
  expect(JSON.stringify(item)).not.toContain('identified')
})
