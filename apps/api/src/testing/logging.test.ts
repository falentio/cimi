import { expect, test, vi } from 'vitest'
import { apiTestRequest, createApiTestFixture, signUpTestUser } from './fixture.ts'

test('correlates a supplied request ID in API responses and errors', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })
  const requestId = 'request-id-123'

  try {
    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/getInstallationStatus', {
        headers: { 'x-request-id': requestId },
      }),
    )

    expect(response.status).toBe(401)
    expect(response.headers.get('x-request-id')).toBe(requestId)

    const records = parseRecords(infoOutput.mock.calls)
    const errorRecords = records.filter(
      (entry) =>
        entry.logger === 'cimi.api' &&
        entry.properties?.['code'] === 'UNAUTHORIZED' &&
        entry.properties?.['status'] === 401,
    )
    expect(errorRecords).toHaveLength(1)
    const [record] = errorRecords
    if (record === undefined) throw new Error('API error record was not emitted')
    expect(record).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({ requestId }),
      }),
    )
    expect(record.properties).toEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/installation/getInstallationStatus',
        procedure: expect.any(String),
      }),
    )
    expect(record.properties?.['error']).toEqual(
      expect.objectContaining({ name: 'Error', message: 'Unauthorized' }),
    )
    expect(warningOutput).not.toHaveBeenCalled()
  } finally {
    warningOutput.mockRestore()
    infoOutput.mockRestore()
  }
})

test('omits the authenticated user ID from request and error records', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })

  try {
    const { cookie, userId } = await signUpTestUser(
      fixture.app,
      'logging-user@example.com',
      'Logging User',
    )
    infoOutput.mockClear()
    warningOutput.mockClear()

    const response = await apiTestRequest(
      fixture.app,
      '/organization/ensurePersonalOrganization',
      cookie,
      {},
    )

    expect(response.status).toBe(200)

    const httpRecords = parseRecords(infoOutput.mock.calls)
    const matchingHttpRecords = httpRecords.filter(
      (entry) => entry.logger === 'cimi.api.http' && entry.properties?.['status'] === 200,
    )
    expect(matchingHttpRecords).toHaveLength(1)
    const [httpRecord] = matchingHttpRecords
    expect(httpRecord?.properties).not.toHaveProperty('userId')
    expect(JSON.stringify(httpRecords)).not.toContain(userId)

    const invalidResponse = await apiTestRequest(
      fixture.app,
      '/organization/createOrganization',
      cookie,
      {},
    )
    expect(invalidResponse.status).toBe(400)

    const errorRecords = parseRecords(warningOutput.mock.calls)
    const matchingErrorRecords = errorRecords.filter(
      (entry) => entry.logger === 'cimi.api' && entry.properties?.['status'] === 400,
    )
    expect(matchingErrorRecords).toHaveLength(1)
    const [errorRecord] = matchingErrorRecords
    expect(errorRecord?.properties).not.toHaveProperty('userId')
    expect(JSON.stringify(errorRecords)).not.toContain(userId)
  } finally {
    warningOutput.mockRestore()
    infoOutput.mockRestore()
  }
})

test('records malformed request bodies as client errors matching the response', async () => {
  const warningOutput = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })

  try {
    const response = await fixture.app.fetch(
      new Request('http://localhost/api/installation/initializeInstallation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{malformed',
      }),
    )

    expect(response.status).toBe(400)
    const errorRecords = parseRecords(warningOutput.mock.calls).filter(
      (entry) => entry.logger === 'cimi.api' && entry.properties?.['code'] === 'BAD_REQUEST',
    )
    expect(errorRecords).toHaveLength(1)
    expect(errorRecords[0]?.properties?.['status']).toBe(400)
  } finally {
    warningOutput.mockRestore()
  }
})

test('normalizes request IDs before they reach responses or records', async () => {
  const infoOutput = vi.spyOn(console, 'info').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({ logging: { lowestLevel: 'info' } })
  const rawRequestId = `token=secret-${'x'.repeat(300)}`

  try {
    const response = await fixture.app.fetch(
      new Request('http://localhost/api/system/health', {
        headers: { 'x-request-id': rawRequestId },
      }),
    )

    const responseRequestId = response.headers.get('x-request-id')
    expect(responseRequestId).not.toBe(rawRequestId)
    expect(responseRequestId).not.toContain('secret')
    expect(responseRequestId?.length).toBeLessThanOrEqual(256)

    const httpRecords = parseRecords(infoOutput.mock.calls).filter(
      (entry) => entry.logger === 'cimi.api.http',
    )
    expect(httpRecords).toHaveLength(1)
    expect(httpRecords[0]?.properties?.['requestId']).toBe(responseRequestId)
  } finally {
    infoOutput.mockRestore()
  }
})

test('reports health fallbacks without changing the health response', async () => {
  const errorOutput = vi.spyOn(console, 'error').mockImplementation(() => {})
  await using fixture = await createApiTestFixture({
    logging: { lowestLevel: 'info' },
    lifecycle: {
      async getSnapshot() {
        throw new Error('health\nprobe failed')
      },
    },
  })

  try {
    const response = await fixture.app.fetch(new Request('http://localhost/api/system/health'))

    expect(response.status).toBe(200)
    const records = parseRecords(errorOutput.mock.calls)
    const healthRecords = records.filter(
      (entry) =>
        entry.logger === 'cimi.api.health' && entry.properties?.['operation'] === 'lifecycle',
    )
    expect(healthRecords).toHaveLength(1)
    expect(healthRecords).toContainEqual(
      expect.objectContaining({
        logger: 'cimi.api.health',
        properties: expect.objectContaining({
          operation: 'lifecycle',
          stage: 'fallback',
          error: expect.objectContaining({ message: 'health probe failed' }),
        }),
      }),
    )
  } finally {
    errorOutput.mockRestore()
  }
})

type LogRecord = {
  logger?: string
  properties?: Record<string, unknown>
}

function parseRecords(calls: readonly unknown[][]): LogRecord[] {
  return calls.flatMap((args) =>
    args.flatMap((value) => {
      try {
        const parsed: unknown = JSON.parse(String(value))
        return isLogRecord(parsed) ? [parsed] : []
      } catch {
        return []
      }
    }),
  )
}

function isLogRecord(value: unknown): value is LogRecord {
  if (typeof value !== 'object' || value === null) return false
  const properties = Reflect.get(value, 'properties')
  return properties === undefined || (typeof properties === 'object' && properties !== null)
}
