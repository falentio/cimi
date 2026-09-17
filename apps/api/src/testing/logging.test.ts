import { expect, test, vi } from 'vitest'
import { createApiTestFixture } from './fixture.ts'

test('correlates a supplied request ID in API responses and errors', async () => {
  await using fixture = await createApiTestFixture()
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
  }
})
