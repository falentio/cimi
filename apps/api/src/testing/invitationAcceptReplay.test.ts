import { expect, test } from 'vitest'
import { createApiTestFixture, signUpTestUser } from './fixture.ts'

test('an authenticated replay of a consumed invitation returns not found', async () => {
  await using fixture = await createApiTestFixture()
  const { app } = fixture
  const owner = await signUpTestUser(app, 'replay-owner@example.com', 'Replay Owner')
  const invitee = await signUpTestUser(app, 'replay-guest@example.com', 'Replay Guest')

  const createResponse = await app.fetch(
    new Request('http://localhost/api/organization/createOrganization', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ name: 'Replay Org' }),
    }),
  )
  expect(createResponse.status, await createResponse.clone().text()).toBe(201)
  const organization = await createResponse.json()

  const invitationResponse = await app.fetch(
    new Request('http://localhost/api/invitation/createInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ organizationId: organization.id, role: 'member' }),
    }),
  )
  expect(invitationResponse.status, await invitationResponse.clone().text()).toBe(201)
  const invitation = await invitationResponse.json()
  expect(typeof invitation.token).toBe('string')

  const accept = await app.fetch(
    new Request('http://localhost/api/invitation/acceptInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: invitee.cookie },
      body: JSON.stringify({ token: invitation.token }),
    }),
  )
  expect(accept.status, await accept.clone().text()).toBe(200)
  await expect(accept.json()).resolves.toMatchObject({
    organizationId: organization.id,
    userId: invitee.userId,
    role: 'member',
  })

  const replay = await app.fetch(
    new Request('http://localhost/api/invitation/acceptInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: invitee.cookie },
      body: JSON.stringify({ token: invitation.token }),
    }),
  )
  expect(replay.status).toBe(404)
  await expect(replay.json()).resolves.toMatchObject({ code: 'NOT_FOUND' })
})
