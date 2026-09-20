import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const DEFAULT_URL = 'http://localhost:3000/api/system/health'
const DEFAULT_REQUESTS = 100
const DEFAULT_SAMPLES = 5
const DEFAULT_MAX_P95_INCREASE_PERCENT = 10
const SUPPORTED_OPTIONS = new Set([
  'url',
  'requests',
  'samples',
  'warmup-requests',
  'baseline-p95-ms',
  'max-p95-increase-percent',
  'records-file',
  'required-records',
])
const BOOLEAN_OPTIONS = new Set(['required-records'])

const options = parseOptions(process.argv.slice(2))
const benchmarkPrefix = `benchmark-${randomUUID()}`
const measuredSamples = []
const measuredRequestIds = []
const warmupRequestPrefixes = []
for (let sample = 0; sample < options.samples; sample += 1) {
  if (options.warmupRequests > 0) {
    const warmupRequestPrefix = `${benchmarkPrefix}-warmup-${sample}`
    warmupRequestPrefixes.push(warmupRequestPrefix)
    await runBenchmark({
      url: options.url,
      requests: options.warmupRequests,
      requestIdPrefix: warmupRequestPrefix,
    })
  }
  const measuredRequestPrefix = `${benchmarkPrefix}-measured-${sample}`
  const measuredSample = await runBenchmark({
    url: options.url,
    requests: options.requests,
    requestIdPrefix: measuredRequestPrefix,
  })
  measuredSamples.push(measuredSample)
  measuredRequestIds.push(...measuredSample.map(({ requestId }) => requestId))
}
const samples = measuredSamples.flat()
const durations = samples.map(({ durationMs }) => durationMs).sort((a, b) => a - b)
const statusCounts = Object.groupBy(samples, ({ status }) => String(status))
const statusFailures = summarizeStatusFailures(samples)
const p95MsBySample = measuredSamples.map((sample) => {
  const durations = sample.map(({ durationMs }) => durationMs).sort((a, b) => a - b)
  return percentile(durations, 0.95)
})
const p95Ms = round(
  percentile(
    [...p95MsBySample].sort((a, b) => a - b),
    0.5,
  ),
)
const recordCapture = await verifyRecords({
  path: options.recordsFile,
  required: options.requiredRecords,
  requestIds: measuredRequestIds,
  ignoredRequestIdPrefixes: warmupRequestPrefixes,
})
const result = {
  url: options.url.href,
  requests: options.requests,
  samples: options.samples,
  measuredRequests: samples.length,
  warmupRequests: options.warmupRequests,
  medianMs: round(percentile(durations, 0.5)),
  p95Ms,
  p95MsBySample: p95MsBySample.map(round),
  statusCounts: Object.fromEntries(
    Object.entries(statusCounts).map(([status, values]) => [status, values.length]),
  ),
  statusFailures,
  recordCapture,
  ...(options.baselineP95Ms === undefined
    ? {}
    : {
        performanceGate: evaluateP95Gate({
          baselineP95Ms: options.baselineP95Ms,
          maxIncreasePercent: options.maxP95IncreasePercent,
          p95Ms,
          statusFailures,
        }),
      }),
}

console.log(JSON.stringify(result))
if (
  statusFailures.count > 0 ||
  result.performanceGate?.passed === false ||
  (recordCapture.status !== 'not-configured' && recordCapture.passed === false)
) {
  process.exitCode = 1
}

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`)

    const option = argument.slice(2)
    const separator = option.indexOf('=')
    const name = separator === -1 ? option : option.slice(0, separator)
    const inlineValue = separator === -1 ? undefined : option.slice(separator + 1)
    if (!SUPPORTED_OPTIONS.has(name)) throw new Error(`Unknown option: --${name}`)

    if (BOOLEAN_OPTIONS.has(name) && inlineValue === undefined) {
      values.set(name, 'true')
      continue
    }

    const value = inlineValue ?? args[++index]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`)
    }
    values.set(name, value)
  }

  const url = new URL(values.get('url') ?? DEFAULT_URL)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Expected an HTTP(S) URL, received ${url.href}`)
  }

  const requests = optionNumber(values, 'requests', DEFAULT_REQUESTS)
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error(`Expected --requests to be a positive integer, received ${requests}`)
  }

  const samples = optionNumber(values, 'samples', DEFAULT_SAMPLES)
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error(`Expected --samples to be a positive integer, received ${samples}`)
  }

  const warmupRequests = optionNumber(values, 'warmup-requests', 0)
  if (!Number.isInteger(warmupRequests) || warmupRequests < 0) {
    throw new Error(
      `Expected --warmup-requests to be a non-negative integer, received ${warmupRequests}`,
    )
  }

  const baselineP95Ms = optionalNumber(values.get('baseline-p95-ms'))
  const maxP95IncreasePercent = optionNumber(
    values,
    'max-p95-increase-percent',
    DEFAULT_MAX_P95_INCREASE_PERCENT,
  )
  if (!Number.isFinite(maxP95IncreasePercent) || maxP95IncreasePercent < 0) {
    throw new Error(
      `Expected --max-p95-increase-percent to be a non-negative number, received ${maxP95IncreasePercent}`,
    )
  }

  const requiredRecords = values.get('required-records') === 'true'
  const requiredRecordsValue = values.get('required-records')
  if (requiredRecordsValue !== undefined && !['true', 'false'].includes(requiredRecordsValue)) {
    throw new Error(
      `Expected --required-records to be true or false, received ${requiredRecordsValue}`,
    )
  }
  const recordsFile = values.get('records-file')

  return {
    url,
    requests,
    samples,
    warmupRequests,
    baselineP95Ms,
    maxP95IncreasePercent,
    recordsFile,
    requiredRecords,
  }
}

async function runBenchmark({ url, requests, requestIdPrefix }) {
  const samples = []
  for (let request = 0; request < requests; request += 1) {
    const requestId = `${requestIdPrefix}-${request}`
    const startedAt = performance.now()
    const response = await fetch(url, {
      headers: { 'x-request-id': requestId },
      signal: AbortSignal.timeout(30_000),
    })
    await response.arrayBuffer()
    samples.push({
      durationMs: performance.now() - startedAt,
      status: response.status,
      requestId,
    })
  }
  return samples
}

async function verifyRecords({ path, required, requestIds, ignoredRequestIdPrefixes }) {
  if (path === undefined) {
    return required
      ? {
          status: 'missing',
          passed: false,
          reason: 'A records file is required when --required-records is enabled',
          expectedRecords: requestIds.length,
          parsedRecords: 0,
          httpRecords: 0,
          missingRequestIds: requestIds,
          duplicateRequestIds: [],
          malformedRecords: [],
        }
      : { status: 'not-configured', passed: true }
  }

  let content
  try {
    content = await readFile(path, 'utf8')
  } catch (error) {
    return {
      status: 'unreadable',
      passed: false,
      reason: safeErrorMessage(error),
      expectedRecords: requestIds.length,
      parsedRecords: 0,
      httpRecords: 0,
      missingRequestIds: requestIds,
      duplicateRequestIds: [],
      malformedRecords: [],
    }
  }

  const parsedRecords = []
  const malformedRecords = []
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    try {
      const record = JSON.parse(line)
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        malformedRecords.push({ line: index + 1, reason: 'record is not an object' })
      } else {
        parsedRecords.push({ line: index + 1, record })
      }
    } catch {
      malformedRecords.push({ line: index + 1, reason: 'invalid JSON' })
    }
  }

  const requestIdCounts = new Map()
  const expectedRequestIds = new Set(requestIds)
  const unexpectedRequestIds = new Set()
  let httpRecords = 0
  for (const { line, record } of parsedRecords) {
    if (record.logger !== 'cimi.api.http') continue
    httpRecords += 1
    const requestId = record.properties?.requestId
    if (typeof requestId !== 'string') {
      malformedRecords.push({ line, reason: 'HTTP record has no request ID' })
      continue
    }
    if (ignoredRequestIdPrefixes.some((prefix) => requestId.startsWith(`${prefix}-`))) continue
    requestIdCounts.set(requestId, (requestIdCounts.get(requestId) ?? 0) + 1)
    if (!expectedRequestIds.has(requestId)) unexpectedRequestIds.add(requestId)
  }

  const missingRequestIds = requestIds.filter((requestId) => !requestIdCounts.has(requestId))
  const duplicateRequestIds = [...requestIdCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([requestId, count]) => ({ requestId, count }))

  return {
    status: 'present',
    passed:
      malformedRecords.length === 0 &&
      missingRequestIds.length === 0 &&
      duplicateRequestIds.length === 0 &&
      unexpectedRequestIds.size === 0,
    expectedRecords: requestIds.length,
    parsedRecords: parsedRecords.length,
    httpRecords,
    missingRequestIds,
    duplicateRequestIds,
    unexpectedRequestIds: [...unexpectedRequestIds],
    malformedRecords,
  }
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

function optionNumber(values, name, fallback) {
  const value = values.get(name)
  if (value === '') throw new Error(`Expected --${name} to have a value`)
  return Number(value ?? fallback)
}

function percentile(sortedValues, quantile) {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * quantile) - 1)
  return sortedValues[index]
}

function round(value) {
  return Number(value.toFixed(2))
}

function summarizeStatusFailures(samples) {
  const failures = samples.filter(({ status }) => status < 200 || status >= 300)
  const byStatus = Object.groupBy(failures, ({ status }) => String(status))
  return {
    count: failures.length,
    byStatus: Object.fromEntries(
      Object.entries(byStatus).map(([status, values]) => [status, values.length]),
    ),
  }
}

function optionalNumber(value) {
  if (value === undefined) return undefined
  if (value === '') throw new Error('Expected a positive number, received an empty value')
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received ${value}`)
  }
  return parsed
}

function evaluateP95Gate({ baselineP95Ms, maxIncreasePercent, p95Ms, statusFailures }) {
  const allowedP95Ms = round(baselineP95Ms * (1 + maxIncreasePercent / 100))
  const increasePercent = round(((p95Ms - baselineP95Ms) / baselineP95Ms) * 100)
  return {
    baselineP95Ms,
    maxIncreasePercent,
    allowedP95Ms,
    increasePercent,
    statusFailures,
    passed: statusFailures.count === 0 && p95Ms <= allowedP95Ms,
  }
}
