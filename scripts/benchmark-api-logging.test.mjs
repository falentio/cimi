import { spawn } from 'node:child_process'
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
})

async function startServer(status) {
  const server = createServer((_request, response) => {
    response.writeHead(status, { 'content-type': 'text/plain' })
    response.end('response')
  })
  servers.add(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/health` }
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
