import { expect, test, vi } from 'vitest'
import { createApiTestFixture } from './fixture.ts'

test('correlates a supplied request ID in API responses and errors', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'warning' } })
  const requestId = 'request-id-123'
  const infoCallsBeforeRequest = infoOutput.mock.calls.length
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/getInstallationStatus', {
        headers: { 'x-request-id': requestId },
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-request-id')).toBe(requestId)
    expect(infoOutput.mock.calls.length).toBe(infoCallsBeforeRequest)

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
