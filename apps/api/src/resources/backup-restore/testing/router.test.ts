import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import { createApiTestFixture, signUpTestUser } from '../../../testing/fixture.ts'
import { schema } from '@cimi/contract'

describe('backup-restore routes', () => {
  it('registers the admin backup query surface', async () => {
    await using fixture = await createApiTestFixture()

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/backup-restore/listBackups'),
    )

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('returns the paged backup list for an installation admin', async () => {
    await using fixture = await createApiTestFixture()
    const user = await signUpTestUser(fixture.app, 'backup-admin@example.com', 'Backup Admin')

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/backup-restore/listBackups', {
        headers: { cookie: user.cookie },
      }),
    )

    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(() => v.parse(schema.SBackupListOutput, body)).not.toThrow()
  })

  it('starts a configured SQLite backup and returns a contract-valid operation', async () => {
    await using fixture = await createApiTestFixture()
    const user = await signUpTestUser(fixture.app, 'backup-create@example.com', 'Backup Create')
    const initialized = await fixture.app.fetch(
      new Request('http://localhost/api/installation/initializeInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: JSON.stringify({}),
      }),
    )
    expect(initialized.status).toBe(201)

    const response = await fixture.app.fetch(
      new Request('http://localhost/api/backup-restore/createBackup', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: user.cookie },
        body: '{}',
      }),
    )

    expect(response.status).toBe(202)
    const body: unknown = await response.json()
    expect(() => v.parse(schema.SBackup, body)).not.toThrow()
  })
})
