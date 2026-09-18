import { expect, test, vi } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'

test('correlates a supplied request ID in API responses and errors', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })
  const requestId = 'request-id-123'
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/getInstallationStatus', {
        headers: { 'x-request-id': requestId },
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-request-id')).toBe(requestId)

    const records = errorOutput.mock.calls.map(([line]) => JSON.parse(String(line)))
    const record = records.find(
      (entry) => entry.properties?.code === 'UNAUTHORIZED' && entry.properties?.status === 401,
    )
    expect(record).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({ requestId }),
      }),
    )
    expect(record.properties).not.toHaveProperty('error')
  } finally {
    errorOutput.mockRestore()
    infoOutput.mockRestore()
  }
})

test('includes the authenticated user ID in request and error records', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })

  try {
    const { cookie, userId } = await signUpTestUser(
      fixture.app,
      'logging-user@example.com',
      'Logging User',
    )
    infoOutput.mockClear()
    errorOutput.mockClear()

    const response = await apiTestRequest(
      fixture.app,
      '/organization/ensurePersonalOrganization',
      cookie,
      {},
    )

    expect(response.status).toBe(200)

    const httpRecords = infoOutput.mock.calls.map(([line]) => JSON.parse(String(line)))
    const httpRecord = httpRecords.find(
      (entry) => entry.logger === 'cimi.api.http' && entry.properties?.status === 200,
    )
    expect(httpRecord).toEqual(
      expect.objectContaining({ properties: expect.objectContaining({ userId }) }),
    )

    const invalidResponse = await apiTestRequest(
      fixture.app,
      '/organization/createOrganization',
      cookie,
      {},
    )
    expect(invalidResponse.status).toBe(400)

    const errorRecords = errorOutput.mock.calls.map(([line]) => JSON.parse(String(line)))
    const errorRecord = errorRecords.find(
      (entry) => entry.logger === 'cimi.api' && entry.properties?.status === 400,
    )
    expect(errorRecord).toEqual(
      expect.objectContaining({ properties: expect.objectContaining({ userId }) }),
    )
  } finally {
    errorOutput.mockRestore()
    infoOutput.mockRestore()
  }
})
