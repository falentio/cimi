const DEFAULT_URL = 'http://localhost:3000/api/system/health'
const DEFAULT_REQUESTS = 100

const options = parseOptions(process.argv.slice(2))
const samples = await runBenchmark(options)
const durations = samples.map(({ durationMs }) => durationMs).sort((a, b) => a - b)
const statusCounts = Object.groupBy(samples, ({ status }) => String(status))

console.log(
  JSON.stringify({
    url: options.url.href,
    requests: samples.length,
    medianMs: round(percentile(durations, 0.5)),
    p95Ms: round(percentile(durations, 0.95)),
    statusCounts: Object.fromEntries(
      Object.entries(statusCounts).map(([status, values]) => [status, values.length]),
    ),
  }),
)

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

  return { url, requests }
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
