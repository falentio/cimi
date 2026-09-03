import { expect, test } from 'vitest'
import { ERROR_CATALOG } from '@cimi/contract'
import { closeDb, schema } from '@cimi/db'
import { createMigratedTestDb, createTestAnalyticsDb } from '@cimi/db/testing'
import { createAuth } from '@cimi/auth/server'
import { createApiApp } from '../index.ts'

async function createFixture() {
  const db = createMigratedTestDb()
  try {
    const analytics = await createTestAnalyticsDb()
    try {
      const auth = createAuth({
        db,
        schema: schema.betterAuthSchema,
        secret: 'test-secret-1234567890',
        baseURL: 'http://localhost',
      })
      const app = createApiApp({ db, auth, analytics, baseUrl: 'http://localhost' })
      return {
        app,
        auth,
        db,
        analytics,
        async [Symbol.asyncDispose]() {
          try {
            await analytics.close()
          } finally {
            closeDb(db)
          }
        },
      }
    } catch (error) {
      await analytics.close()
      throw error
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

async function signUp(
  app: ReturnType<typeof createApiApp>,
  email: string,
  name: string,
): Promise<{ cookie: string; userId: string }> {
  const response = await app.fetch(
    new Request('http://localhost/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email, password: 'password123' }),
    }),
  )
  expect(response.status).toBe(200)
  const body = await response.json()
  const setCookie = response.headers.get('set-cookie')
  expect(setCookie).toBeTruthy()
  return { cookie: setCookie!.split(';', 1)[0]!, userId: body.user.id }
}

test('rejects unauthenticated invitation acceptance', async () => {
  await using fixture = await createFixture()
  const { app } = fixture

  const response = await app.fetch(
    new Request('http://localhost/api/invitation/acceptInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'missing-token' }),
    }),
  )

  expect(response.status).toBe(401)
  await expect(response.json()).resolves.toMatchObject({
    code: 'UNAUTHORIZED',
    status: 401,
    message: ERROR_CATALOG.UNAUTHORIZED.message,
  })
})

test('an unauthenticated replay consumes nothing', async () => {
  await using fixture = await createFixture()
  const { app } = fixture
  const owner = await signUp(app, 'invite-owner@example.com', 'Invite Owner')
  const invitee = await signUp(app, 'invite-guest@example.com', 'Invite Guest')

  const createResponse = await app.fetch(
    new Request('http://localhost/api/organization/createOrganization', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: owner.cookie },
      body: JSON.stringify({ name: 'Accept Org' }),
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

  const replay = await app.fetch(
    new Request('http://localhost/api/invitation/acceptInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: invitation.token }),
    }),
  )
  expect(replay.status).toBe(401)
  await expect(replay.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED', status: 401 })

  const accept = await app.fetch(
    new Request('http://localhost/api/invitation/acceptInvitation', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: invitee.cookie },
      body: JSON.stringify({ token: invitation.token }),
    }),
  )
  expect(accept.status, await accept.clone().text()).toBe(200)
  const membership = await accept.json()
  expect(membership).toMatchObject({
    organizationId: organization.id,
    userId: invitee.userId,
    role: 'member',
  })
  expect(membership).not.toHaveProperty('tokenHash')
  expect(JSON.stringify(membership)).not.toContain(invitation.token)
})
