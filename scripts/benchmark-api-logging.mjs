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
])

const options = parseOptions(process.argv.slice(2))
const measuredSamples = []
for (let sample = 0; sample < options.samples; sample += 1) {
  if (options.warmupRequests > 0) {
    await runBenchmark({ url: options.url, requests: options.warmupRequests })
  }
  measuredSamples.push(await runBenchmark(options))
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
if (statusFailures.count > 0 || result.performanceGate?.passed === false) process.exitCode = 1

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`)

    const [name, inlineValue] = argument.slice(2).split('=', 2)
    if (!SUPPORTED_OPTIONS.has(name)) throw new Error(`Unknown option: --${name}`)

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

  const requests = Number(values.get('requests') ?? DEFAULT_REQUESTS)
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error(`Expected --requests to be a positive integer, received ${requests}`)
  }

  const samples = Number(values.get('samples') ?? DEFAULT_SAMPLES)
  if (!Number.isInteger(samples) || samples < 1) {
    throw new Error(`Expected --samples to be a positive integer, received ${samples}`)
  }

  const warmupRequests = Number(values.get('warmup-requests') ?? 0)
  if (!Number.isInteger(warmupRequests) || warmupRequests < 0) {
    throw new Error(
      `Expected --warmup-requests to be a non-negative integer, received ${warmupRequests}`,
    )
  }

  const baselineP95Ms = optionalNumber(values.get('baseline-p95-ms'))
  const maxP95IncreasePercent = Number(
    values.get('max-p95-increase-percent') ?? DEFAULT_MAX_P95_INCREASE_PERCENT,
  )
  if (!Number.isFinite(maxP95IncreasePercent) || maxP95IncreasePercent < 0) {
    throw new Error(
      `Expected --max-p95-increase-percent to be a non-negative number, received ${maxP95IncreasePercent}`,
    )
  }

  return { url, requests, samples, warmupRequests, baselineP95Ms, maxP95IncreasePercent }
}

async function runBenchmark({ url, requests }) {
  const samples = []
  for (let request = 0; request < requests; request += 1) {
    const startedAt = performance.now()
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    await response.arrayBuffer()
    samples.push({ durationMs: performance.now() - startedAt, status: response.status })
  }
  return samples
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
