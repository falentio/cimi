import { statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { parse } from 'valibot'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'
import { AcceptanceRepositoryDrizzle } from '../repository.drizzle.ts'

function candidate(
  siteId: string,
  policyRevisionId: string,
  overrides: {
    eventId?: string
    replaySequence?: number
    payloadFingerprint?: string
    receiptTime?: string
  } = {},
) {
  return {
    siteId,
    event: {
      eventId: overrides.eventId ?? 'event_race',
      occurrenceTime: '2026-09-01T00:00:00.000Z',
      identifiedUserId: null,
      properties: {},
      kind: 'custom_event' as const,
      name: 'checkout',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      deviceType: null,
      browser: null,
      os: null,
      country: null,
    },
    receiptTime: overrides.receiptTime ?? '2026-09-01T00:00:00.000Z',
    late: false,
    policyRevisionId,
    payloadFingerprint: overrides.payloadFingerprint ?? 'fp-1',
    visitorId: null,
    analyticsSessionId: null,
    replaySequence: overrides.replaySequence ?? 1,
  }
}

test('append reconciles concurrent duplicate commits inside the flush transaction', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture
  const owner = await signUpTestUser(app, 'append-owner@example.com', 'Append Owner')
  const initialized = await apiTestRequest(
    app,
    '/installation/initializeInstallation',
    owner.cookie,
    {},
  )
  expect(initialized.status).toBe(201)
  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: 'Append Org' },
  )
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Append',
    hostname: 'append.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = parse(schema.SSiteCreateOutput, await siteResponse.json())
  const revision = db.$client
    .prepare('SELECT id FROM collection_policy_revision LIMIT 1')
    .get() as {
    id: string
  }
  const repository = new AcceptanceRepositoryDrizzle({ db: fixture.db })

  expect(await repository.append([candidate(site.id, revision.id)])).toEqual([
    { status: 'accepted' },
  ])
  expect(
    await repository.append([
      candidate(site.id, revision.id, {
        replaySequence: 2,
        receiptTime: '2026-09-01T00:00:01.000Z',
      }),
    ]),
  ).toEqual([{ status: 'duplicate', receiptTime: '2026-09-01T00:00:00.000Z' }])
  expect(
    await repository.append([
      candidate(site.id, revision.id, { replaySequence: 3, payloadFingerprint: 'fp-2' }),
    ]),
  ).toEqual([{ status: 'conflict' }])

  const journal = db.$client
    .prepare('SELECT flush_id, replay_sequence FROM event_acceptance_journal ORDER BY rowid')
    .all() as Array<{ flush_id: string | null; replay_sequence: number }>
  expect(journal).toHaveLength(1)
  expect(journal[0]?.flush_id).toBeTruthy()
  expect(journal[0]?.replay_sequence).toBe(1)
  const accepted = db.$client.prepare('SELECT event_id FROM accepted_event').all()
  expect(accepted).toHaveLength(1)
})

test('walBytes reads the wal file size without side effects', async () => {
  await using fixture = await createApiTestFixture()
  const repository = new AcceptanceRepositoryDrizzle({ db: fixture.db })
  const first = repository.walBytes()
  const second = repository.walBytes()
  expect(first).toBe(0)
  expect(second).toBe(0)
  expect(second).toBe(first)
})

test('walBytes reports the file-backed wal size', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cimi-wal-bytes-'))
  const dbPath = join(directory, 'control.sqlite')
  const db = createDb({ path: dbPath })
  try {
    migrateControlDb(db)
    const repository = new AcceptanceRepositoryDrizzle({ db })
    const expected = statSync(`${dbPath}-wal`).size
    expect(expected).toBeGreaterThan(0)
    expect(repository.walBytes()).toBe(expected)
    expect(repository.walBytes()).toBe(expected)
  } finally {
    closeDb(db)
    await rm(directory, { recursive: true, force: true })
  }
})
