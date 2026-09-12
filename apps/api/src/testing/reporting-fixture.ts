import { expect } from 'vitest'
import type { Db } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { apiTestRequest, signUpTestUser } from './fixture.ts'
import type { createApiApp } from '../index.ts'

type App = ReturnType<typeof createApiApp>

/**
 * A fixture whose installation reports ready, so the HTTP admission gate admits analytics reads
 * and the request reaches the reporting handler. The default fixture reports `recovering`.
 */
export function readyLifecycle() {
  return {
    async getSnapshot() {
      return {
        installationStatus: 'ready' as const,
        controlStore: 'ready' as const,
        analyticsStore: 'ready' as const,
        cleanupPending: false,
      }
    },
  }
}

export async function createOwnerSite(
  app: App,
  db: Db,
  email: string,
): Promise<{ readonly cookie: string; readonly siteId: string }> {
  const owner = await signUpTestUser(app, email, 'Report Owner')
  const localPart = email.slice(0, email.indexOf('@'))
  const organizationResponse = await apiTestRequest(
    app,
    '/organization/createOrganization',
    owner.cookie,
    { name: `Report Org ${localPart}` },
  )
  expect(organizationResponse.status).toBe(201)
  const organization = await organizationResponse.json()
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: `${localPart}.example.com`,
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = await siteResponse.json()
  seedRetentionCutoff(db, site.id)
  return { cookie: owner.cookie, siteId: site.id }
}

/**
 * Gives the Site an Effective Retention horizon. Nothing populates the cutoff row for a Site that
 * has never had its retention policy resolved, and admission fails closed on an unknown horizon,
 * so a report test needs one.
 */
export function seedRetentionCutoff(db: Db, siteId: string): void {
  const now = Date.now()
  const installationId = 'ins_report_test'
  db.$client
    .prepare(
      `INSERT INTO installation (id, singleton_key, status, data_directory_ready, created_at, updated_at)
       VALUES (?, 'default', 'ready', 1, ?, ?)
       ON CONFLICT (singleton_key) DO NOTHING`,
    )
    .run(installationId, now, now)
  const existingInstallation = db.$client
    .prepare('SELECT id FROM installation ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined
  const policyId = `rtn_${siteId}`
  db.$client
    .prepare(
      `INSERT INTO retention_policy (
         id, installation_id, scope, event_months, profile_months, version, status,
         effective_from, created_at, updated_at
       ) VALUES (?, ?, 'installation', 12, 12, 1, 'active', ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(policyId, existingInstallation?.id ?? installationId, now, now, now)
  db.$client
    .prepare(
      `INSERT INTO retention_effective_cutoff (
         site_id, installation_id, policy_id, reporting_timezone, local_day,
         event_occurrence_cutoff_at, raw_receipt_cutoff_at, profile_activity_cutoff_at,
         effective_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (site_id) DO UPDATE SET
         event_occurrence_cutoff_at = excluded.event_occurrence_cutoff_at,
         raw_receipt_cutoff_at = excluded.raw_receipt_cutoff_at,
         profile_activity_cutoff_at = excluded.profile_activity_cutoff_at,
         updated_at = excluded.updated_at`,
    )
    .run(
      siteId,
      existingInstallation?.id ?? installationId,
      policyId,
      'UTC',
      '2026-09-05',
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      Date.parse('2026-01-01T00:00:00.000Z'),
      now,
      now,
    )
}

interface SeedEvent {
  readonly sessionId: string
  readonly visitorId: string
  readonly kind: 'page_view' | 'custom_event' | 'outbound' | 'performance' | 'error'
  readonly at: number
  readonly pagePath?: string | undefined
  readonly referrer?: string | null | undefined
  readonly device?: string | null | undefined
  readonly browser?: string | null | undefined
  readonly os?: string | null | undefined
  readonly country?: string | null | undefined
  readonly utmSource?: string | null | undefined
  readonly utmMedium?: string | null | undefined
  readonly utmCampaign?: string | null | undefined
  readonly name?: string | undefined
  readonly destination?: string | undefined
  readonly value?: number | undefined
  readonly unit?: string | null | undefined
  readonly code?: string | null | undefined
  readonly message?: string | null | undefined
  readonly identifiedUserId?: string | undefined
  readonly anonymousIdentityId?: string | undefined
  readonly properties?: Readonly<Record<string, string | number | boolean | null>> | undefined
}

export function seedAcceptedEvents(db: Db, siteId: string, events: readonly SeedEvent[]): void {
  const policyId = db.$client
    .prepare('SELECT policy_revision_id FROM accepted_event LIMIT 1')
    .get() as { policy_revision_id: string } | undefined
  const revisionId = policyId?.policy_revision_id ?? ensurePolicyRevision(db)
  const insert = db.$client.prepare(
    `INSERT INTO accepted_event (
       site_id, event_id, event_kind, occurrence_time, receipt_time, visitor_id,
       anonymous_identity_id, identified_user_id, analytics_session_id, policy_revision_id,
       replay_sequence, payload_fingerprint, projection_state, created_at, device_type, browser,
       operating_system, country, utm_source, utm_medium, utm_campaign
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const sequenceBase = readMaxReplaySequence(db)
  events.forEach((event, index) => {
    const eventId = `evt-${siteId}-${sequenceBase + index + 1}`
    insert.run(
      siteId,
      eventId,
      event.kind,
      event.at,
      event.at,
      event.visitorId,
      event.anonymousIdentityId ?? null,
      event.identifiedUserId ?? null,
      event.sessionId,
      revisionId,
      sequenceBase + index + 1,
      `fp-${siteId}-${sequenceBase + index + 1}`,
      event.at,
      event.device ?? null,
      event.browser ?? null,
      event.os ?? null,
      event.country ?? null,
      event.utmSource ?? null,
      event.utmMedium ?? null,
      event.utmCampaign ?? null,
    )
    const eventPk = readEventPk(db, siteId, eventId)
    if (event.pagePath !== undefined) {
      db.$client
        .prepare('INSERT INTO event_page_view (event_pk, page_path, referrer) VALUES (?, ?, ?)')
        .run(eventPk, event.pagePath, event.referrer ?? null)
    }
    if (event.kind === 'custom_event') {
      db.$client
        .prepare('INSERT INTO event_custom (event_pk, name) VALUES (?, ?)')
        .run(eventPk, event.name ?? '')
    }
    if (event.kind === 'outbound') {
      db.$client
        .prepare('INSERT INTO event_outbound (event_pk, destination, name) VALUES (?, ?, ?)')
        .run(eventPk, event.destination ?? '', event.name ?? null)
    }
    if (event.kind === 'performance') {
      db.$client
        .prepare('INSERT INTO event_performance (event_pk, name, value, unit) VALUES (?, ?, ?, ?)')
        .run(eventPk, event.name ?? '', event.value ?? 0, event.unit ?? null)
    }
    if (event.kind === 'error') {
      db.$client
        .prepare('INSERT INTO event_error (event_pk, name, code, message) VALUES (?, ?, ?, ?)')
        .run(eventPk, event.name ?? '', event.code ?? null, event.message ?? null)
    }
    for (const [key, value] of Object.entries(event.properties ?? {})) {
      insertProperty(db, eventPk, key, value)
    }
  })
}

function insertProperty(
  db: Db,
  eventPk: number,
  key: string,
  value: string | number | boolean | null,
): void {
  const statement = db.$client.prepare(
    `INSERT INTO event_property (
       event_pk, property_key, value_type, string_value, number_value, boolean_value
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
  if (value === null) {
    statement.run(eventPk, key, 'null', null, null, null)
  } else if (typeof value === 'number') {
    statement.run(eventPk, key, 'number', null, value, null)
  } else if (typeof value === 'boolean') {
    statement.run(eventPk, key, 'boolean', null, null, value ? 1 : 0)
  } else {
    statement.run(eventPk, key, 'string', value, null, null)
  }
}

function readEventPk(db: Db, siteId: string, eventId: string): number {
  const row = db.$client
    .prepare('SELECT event_pk AS eventPk FROM accepted_event WHERE site_id = ? AND event_id = ?')
    .get(siteId, eventId) as { eventPk: number } | undefined
  if (row === undefined) throw new Error(`Accepted event ${eventId} was not inserted`)
  return row.eventPk
}

function readMaxReplaySequence(db: Db): number {
  const row = db.$client
    .prepare('SELECT coalesce(max(replay_sequence), 0) AS sequence FROM accepted_event')
    .get() as { sequence: number } | undefined
  return Number(row?.sequence ?? 0)
}

function ensurePolicyRevision(db: Db): string {
  const installation = db.$client
    .prepare('SELECT id FROM installation ORDER BY created_at LIMIT 1')
    .get() as { id: string } | undefined
  const installationId = installation?.id
  if (installationId === undefined) throw new Error('Seed a retention cutoff before seeding events')
  const id = 'pol_report_test'
  const now = Date.now()
  db.$client
    .prepare(
      `INSERT INTO collection_policy_revision (
         id, installation_id, scope, version, policy_json, effective_from, committed_at, created_at
       ) VALUES (?, ?, 'installation', 1, ?, ?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
    )
    .run(
      id,
      installationId,
      JSON.stringify(contractSchema.DEFAULT_COLLECTION_POLICY),
      now,
      now,
      now,
    )
  return id
}
