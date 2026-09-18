import { call } from '@orpc/server'
import { expect, test } from 'vitest'
import { createApiE2eFixture } from './fixture.ts'

test('accepts public events, preserves replay identity across restart, and persists profiles', async () => {
  await using fixture = await createApiE2eFixture()
  const admin = await fixture.createUser('ingestion-admin@example.com', 'Ingestion Admin')
  await call(
    fixture.router.installation.initializeInstallation,
    {},
    { context: await admin.context() },
  )
  const organization = await call(
    fixture.router.organization.createOrganization,
    { name: 'Ingestion Organization' },
    { context: await admin.context() },
  )
  const site = await call(
    fixture.router.site.createSite,
    { organizationId: organization.id, name: 'Production', hostname: 'ingestion.example.com' },
    { context: await admin.context() },
  )
  const anonymous = fixture.unauthenticatedContext()
  const event = {
    eventId: 'evt_checkout_completed',
    ingestionIdentifier: site.ingestionIdentifier,
    kind: 'custom_event' as const,
    name: 'checkout_completed',
    anonymousIdentityId: 'anon_checkout',
    properties: { orderValue: 42 },
  }

  await expect(
    call(fixture.router.eventIngestion.collectEvent, event, { context: anonymous }),
  ).resolves.toMatchObject({ status: 'accepted', eventId: event.eventId })
  await expect(
    call(fixture.router.eventIngestion.collectEvent, event, { context: anonymous }),
  ).resolves.toMatchObject({ status: 'duplicate', eventId: event.eventId })
  await expect(
    call(
      fixture.router.eventIngestion.collectEvent,
      { ...event, name: 'different_event' },
      { context: anonymous },
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' })

  await expect(
    call(
      fixture.router.eventIngestion.collectEvents,
      {
        ingestionIdentifier: site.ingestionIdentifier,
        events: [
          { eventId: 'evt_signup', kind: 'custom_event', name: 'signup' },
          { eventId: 'evt_invalid', kind: 'not-an-event' },
        ],
      },
      { context: anonymous },
    ),
  ).resolves.toEqual({
    results: [
      { status: 'accepted', eventId: 'evt_signup', receiptTime: expect.any(String) },
      { status: 'itemError', eventId: 'evt_invalid', code: 'BAD_REQUEST' },
    ],
  })

  await fixture.restart()
  await expect(
    call(fixture.router.eventIngestion.collectEvent, event, {
      context: fixture.unauthenticatedContext(),
    }),
  ).resolves.toMatchObject({ status: 'duplicate', eventId: event.eventId })

  await expect(
    call(
      fixture.router.identityProfile.identify,
      {
        ingestionIdentifier: site.ingestionIdentifier,
        identifiedUserId: 'user_123',
        anonymousIdentityId: 'anon_checkout',
        traits: { plan: 'pro' },
        collectionContext: { consent: 'granted' },
      },
      { context: fixture.unauthenticatedContext() },
    ),
  ).resolves.toMatchObject({ identifiedUserId: 'user_123', status: 'active' })
  await expect(
    call(
      fixture.router.identityProfile.listProfiles,
      { siteId: site.id, offset: 0, limit: 20 },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ items: [expect.objectContaining({ identifiedUserId: 'user_123' })] })
  await expect(
    call(
      fixture.router.identityProfile.requestProfileDeletion,
      { siteId: site.id, identifiedUserId: 'user_123' },
      { context: await admin.context() },
    ),
  ).resolves.toEqual({ accepted: true, status: 'deletion-requested' })
  await expect(
    call(
      fixture.router.identityProfile.getDeletionStatus,
      { siteId: site.id, identifiedUserId: 'user_123' },
      { context: await admin.context() },
    ),
  ).resolves.toMatchObject({ status: 'deletion-requested' })
}, 15_000)
