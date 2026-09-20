import { spawn } from 'node:child_process'
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'

const scriptPath = fileURLToPath(new URL('./benchmark-api-logging.mjs', import.meta.url))
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const servers = new Set()

afterEach(async () => {
  await Promise.all(
    [...servers].map(
      (server) =>
        new Promise((resolve) => {
          server.close(() => resolve())
        }),
    ),
  )
  servers.clear()
})

describe('benchmark-api-logging', () => {
  test('rejects unknown options before making a request', async () => {
    const { url } = await startServer(200)
    const result = await runBenchmark([
      '--url',
      url,
      '--requests',
      '1',
      '--samples',
      '1',
      '--unknown-flag',
      'ignored',
    ])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('Unknown option: --unknown-flag')
    expect(result.stdout).toBe('')
  })

  test('reports non-2xx responses and fails the performance gate', async () => {
    const { url } = await startServer(500)
    const result = await runBenchmark([
      '--url',
      url,
      '--requests',
      '2',
      '--samples',
      '1',
      '--baseline-p95-ms',
      '1000',
    ])

    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      statusFailures: { count: 2, byStatus: { 500: 2 } },
      performanceGate: { passed: false },
    })
  })

  test('fails the performance gate for slow successful responses', async () => {
    const { url } = await startServer(200, undefined, 20)
    const result = await runBenchmark([
      '--url',
      url,
      '--requests',
      '2',
      '--samples',
      '1',
      '--baseline-p95-ms',
      '1',
      '--max-p95-increase-percent',
      '0',
    ])

    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      statusFailures: { count: 0 },
      performanceGate: { passed: false },
    })
  })

  test('sends unique request IDs and enforces captured HTTP record cardinality', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-benchmark-'))
    const recordsFile = join(directory, 'records.jsonl')
    const { url, requestIds } = await startServer(200, async ({ requestId, requestNumber }) => {
      if (requestNumber !== 0) return
      await appendFile(
        recordsFile,
        [
          JSON.stringify({ logger: 'cimi.api.http', properties: { requestId } }),
          JSON.stringify({ logger: 'cimi.api.http', properties: { requestId } }),
          '{malformed',
        ].join('\n') + '\n',
      )
    })

    try {
      const result = await runBenchmark([
        '--url',
        url,
        '--requests',
        '2',
        '--samples',
        '1',
        '--records-file',
        recordsFile,
      ])

      expect(result.code).toBe(1)
      expect(requestIds).toHaveLength(2)
      const output = JSON.parse(result.stdout)
      expect(output).toMatchObject({
        recordCapture: {
          status: 'present',
          passed: false,
          missingRequestIds: [requestIds[1]],
          duplicateRequestIds: [{ requestId: requestIds[0], count: 2 }],
        },
      })
      expect(output.recordCapture.malformedRecords).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('fails closed when required record capture is absent', async () => {
    const { url } = await startServer(200)
    const result = await runBenchmark([
      '--url',
      url,
      '--requests',
      '1',
      '--samples',
      '1',
      '--required-records',
    ])

    expect(result.code).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      recordCapture: { status: 'missing', passed: false },
    })
  })

  test('passes when required HTTP records match measured request IDs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-benchmark-'))
    const recordsFile = join(directory, 'records.jsonl')
    const { url } = await startServer(200, ({ requestId }) =>
      appendFile(
        recordsFile,
        JSON.stringify({ logger: 'cimi.api.http', properties: { requestId } }) + '\n',
      ),
    )

    try {
      const result = await runBenchmark([
        '--url',
        url,
        '--requests',
        '2',
        '--samples',
        '1',
        '--records-file',
        recordsFile,
        '--required-records',
      ])

      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        recordCapture: {
          status: 'present',
          passed: true,
          missingRequestIds: [],
          duplicateRequestIds: [],
        },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('ignores warmup records but rejects records from a previous run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cimi-benchmark-'))
    const recordsFile = join(directory, 'records.jsonl')
    await writeFile(
      recordsFile,
      JSON.stringify({ logger: 'cimi.api.http', properties: { requestId: 'benchmark-old-0' } }) +
        '\n',
    )
    const { url } = await startServer(200, ({ requestId }) =>
      appendFile(
        recordsFile,
        JSON.stringify({ logger: 'cimi.api.http', properties: { requestId } }) + '\n',
      ),
    )

    try {
      const result = await runBenchmark([
        '--url',
        url,
        '--requests',
        '1',
        '--samples',
        '1',
        '--warmup-requests',
        '1',
        '--records-file',
        recordsFile,
        '--required-records',
      ])

      expect(result.code).toBe(1)
      expect(JSON.parse(result.stdout)).toMatchObject({
        recordCapture: { passed: false, unexpectedRequestIds: ['benchmark-old-0'] },
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test('rejects invalid required-record values', async () => {
    const { url } = await startServer(200)
    const result = await runBenchmark([
      '--url',
      url,
      '--requests',
      '1',
      '--samples',
      '1',
      '--required-records=maybe',
    ])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('Expected --required-records to be true or false')
  })
})

async function startServer(status, onRequest, responseDelayMs = 0) {
  const requestIds = []
  const server = createServer(async (request, response) => {
    const requestId = request.headers['x-request-id']
    requestIds.push(requestId)
    await onRequest?.({ requestId, requestNumber: requestIds.length - 1 })
    if (responseDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelayMs))
    }
    response.writeHead(status, { 'content-type': 'text/plain' })
    response.end('response')
  })
  servers.add(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/health`, requestIds }
}

function runBenchmark(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repositoryRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('close', (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }))
  })
}
