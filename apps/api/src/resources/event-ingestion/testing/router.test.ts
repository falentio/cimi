import { expect, test } from 'vitest'
import { SOrganizationCreateOutput, schema } from '@cimi/contract'
import { parse } from 'valibot'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

test('collectEvent durably accepts and deduplicates a Site event', async () => {
  await using fixture = await createApiTestFixture()
  const { app, db } = fixture
  const owner = await signUpTestUser(app, 'event-owner@example.com', 'Event Owner')

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
    {
      name: 'Event Org',
    },
  )
  expect(organizationResponse.status, await organizationResponse.clone().text()).toBe(201)
  const organization = parse(SOrganizationCreateOutput, await organizationResponse.json())
  const siteResponse = await apiTestRequest(app, '/site/createSite', owner.cookie, {
    organizationId: organization.id,
    name: 'Production',
    hostname: 'events.example.com',
  })
  expect(siteResponse.status, await siteResponse.clone().text()).toBe(201)
  const site = parse(schema.SSiteCreateOutput, await siteResponse.json())

  const event = {
    eventId: 'event_1',
    ingestionIdentifier: site.ingestionIdentifier,
    kind: 'custom_event',
    name: 'checkout_completed',
  }
  const accepted = await apiTestRequest(app, '/event-ingestion/collectEvent', '', event)
  expect(accepted.status, await accepted.clone().text()).toBe(200)
  const acceptedBody = parse(schema.SAcceptedEvent, await accepted.json())
  expect(acceptedBody).toMatchObject({ status: 'accepted', eventId: event.eventId })

  const duplicate = await apiTestRequest(app, '/event-ingestion/collectEvent', '', event)
  expect(duplicate.status, await duplicate.clone().text()).toBe(200)
  await expect(duplicate.json()).resolves.toEqual({ ...acceptedBody, status: 'duplicate' })

  const batch = await apiTestRequest(app, '/event-ingestion/collectEvents', '', {
    ingestionIdentifier: site.ingestionIdentifier,
    events: [
      event,
      {
        eventId: 'event_2',
        kind: 'custom_event',
        name: 'signup_completed',
      },
      { eventId: 'bad', kind: 'unknown' },
    ],
  })
  expect(batch.status, await batch.clone().text()).toBe(200)
  await expect(batch.json()).resolves.toEqual({
    results: [
      { status: 'duplicate', eventId: 'event_1', receiptTime: acceptedBody.receiptTime },
      { status: 'accepted', eventId: 'event_2', receiptTime: expect.any(String) },
      { status: 'itemError', eventId: 'bad', code: 'BAD_REQUEST' },
    ],
  })

  const rows = db.$client.prepare('SELECT event_id, payload_fingerprint FROM accepted_event').all()
  expect(rows).toHaveLength(2)
})

test('collectEvent rejects a request whose raw body exceeds the transport limit', async () => {
  await using fixture = await createApiTestFixture()

  const response = await apiTestRequest(fixture.app, '/event-ingestion/collectEvent', '', {
    eventId: 'event_oversized',
    ingestionIdentifier: 'ing_unknown',
    kind: 'custom_event',
    name: 'x'.repeat(70_000),
  })

  expect(response.status, await response.clone().text()).toBe(413)
})

test('collectEvents rejects a request whose raw body exceeds the transport limit', async () => {
  await using fixture = await createApiTestFixture()

  const response = await apiTestRequest(fixture.app, '/event-ingestion/collectEvents', '', {
    ingestionIdentifier: 'ing_unknown',
    events: [{ eventId: 'event_oversized', kind: 'custom_event', name: 'x'.repeat(270_000) }],
  })

  expect(response.status, await response.clone().text()).toBe(413)
})

test('collectEvent maps parsed size violations to payload too large', async () => {
  await using fixture = await createApiTestFixture()

  const response = await apiTestRequest(fixture.app, '/event-ingestion/collectEvent', '', {
    eventId: 'event_oversized_property',
    ingestionIdentifier: 'ing_unknown',
    kind: 'custom_event',
    name: 'checkout_completed',
    properties: { oversized: 'x'.repeat(513) },
  })

  expect(response.status, await response.clone().text()).toBe(413)
})
