const DEFAULT_URL = 'http://localhost:3000/api/system/health'
const DEFAULT_REQUESTS = 100
const DEFAULT_MAX_P95_INCREASE_PERCENT = 10

const options = parseOptions(process.argv.slice(2))
if (options.warmupRequests > 0) {
  await runBenchmark({ url: options.url, requests: options.warmupRequests })
}
const samples = await runBenchmark(options)
const durations = samples.map(({ durationMs }) => durationMs).sort((a, b) => a - b)
const statusCounts = Object.groupBy(samples, ({ status }) => String(status))
const p95Ms = round(percentile(durations, 0.95))
const result = {
  url: options.url.href,
  requests: samples.length,
  warmupRequests: options.warmupRequests,
  medianMs: round(percentile(durations, 0.5)),
  p95Ms,
  statusCounts: Object.fromEntries(
    Object.entries(statusCounts).map(([status, values]) => [status, values.length]),
  ),
  ...(options.baselineP95Ms === undefined
    ? {}
    : {
        performanceGate: evaluateP95Gate({
          baselineP95Ms: options.baselineP95Ms,
          maxIncreasePercent: options.maxP95IncreasePercent,
          p95Ms,
        }),
      }),
}

console.log(JSON.stringify(result))
if (result.performanceGate?.passed === false) process.exitCode = 1

function parseOptions(args) {
  const values = new Map()
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`)

    const [name, inlineValue] = argument.slice(2).split('=', 2)
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

  return { url, requests, warmupRequests, baselineP95Ms, maxP95IncreasePercent }
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

function optionalNumber(value) {
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive number, received ${value}`)
  }
  return parsed
}

function evaluateP95Gate({ baselineP95Ms, maxIncreasePercent, p95Ms }) {
  const allowedP95Ms = round(baselineP95Ms * (1 + maxIncreasePercent / 100))
  const increasePercent = round(((p95Ms - baselineP95Ms) / baselineP95Ms) * 100)
  return {
    baselineP95Ms,
    maxIncreasePercent,
    allowedP95Ms,
    increasePercent,
    passed: p95Ms <= allowedP95Ms,
  }
}
