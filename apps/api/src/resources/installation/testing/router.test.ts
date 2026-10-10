import { schema } from '@cimi/contract'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'

describe('installation routes', () => {
  it('rejects ensureInstallation without a session', async () => {
    await using fixture = await createApiTestFixture()

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('rejects ensureInstallation for a non-admin session', async () => {
    await using fixture = await createApiTestFixture()
    await signUpTestUser(fixture.app, 'installation-owner@example.com', 'Installation Owner')

    const member = await signUpTestUser(
      fixture.app,
      'installation-member@example.com',
      'Installation Member',
    )

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: member.cookie },
        body: '{}',
      }),
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('ensures the installation for an installation admin', async () => {
    await using fixture = await createApiTestFixture()
    const user = await signUpTestUser(fixture.app, 'ensure-admin@example.com', 'Ensure Admin')

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: '{}',
      }),
    )

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(() => v.parse(schema.SInstallation, body)).not.toThrow()
  })

  it('returns the existing installation when the row is already present', async () => {
    await using fixture = await createApiTestFixture()
    const user = await signUpTestUser(fixture.app, 'ensure-repeat@example.com', 'Ensure Repeat')

    const first = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: '{}',
      }),
    )

    expect(first.status).toBe(200)

    const second = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: '{}',
      }),
    )

    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(await first.json())
  })

  it('reports healthy system health after an administrator ensured the installation', async () => {
    await using fixture = await createApiTestFixture()
    const user = await signUpTestUser(fixture.app, 'ensure-health@example.com', 'Ensure Health')

    const beforeHealth = await fixture.app.fetch(new Request('http://localhost/api/system/health'))
    expect(beforeHealth.status).toBe(200)
    await expect(beforeHealth.json()).resolves.toMatchObject({ status: 'recovering' })

    const ensured = await fixture.app.fetch(
      new Request('http://localhost/api/installation/ensureInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: '{}',
      }),
    )

    expect(ensured.status).toBe(200)

    const afterHealth = await fixture.app.fetch(new Request('http://localhost/api/system/health'))
    expect(afterHealth.status).toBe(200)
    await expect(afterHealth.json()).resolves.toMatchObject({ status: 'healthy' })
  })
})
