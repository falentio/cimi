import path from 'node:path'
import * as v from 'valibot'

const positiveNumberEnv = () =>
  v.pipe(
    v.string(),
    v.transform((raw) => Number(raw)),
    v.check((value) => Number.isFinite(value) && value > 0, 'must be a positive finite number'),
  )

const configInputSchema = v.object({
  CIMI_DATA_DIR: v.optional(v.pipe(v.string(), v.nonEmpty()), '.cimi'),
  BETTER_AUTH_SECRET: v.pipe(v.string(), v.nonEmpty()),
  BETTER_AUTH_URL: v.optional(v.pipe(v.string(), v.url()), 'http://localhost:4321'),
  NODE_ENV: v.optional(v.picklist(['development', 'test', 'production']), 'development'),
  CIMI_EVENT_SITE_RATE_PER_SECOND: v.optional(positiveNumberEnv()),
  CIMI_EVENT_SITE_BURST: v.optional(positiveNumberEnv()),
  CIMI_EVENT_SOURCE_IP_RATE_PER_SECOND: v.optional(positiveNumberEnv()),
  CIMI_EVENT_SOURCE_IP_BURST: v.optional(positiveNumberEnv()),
  CIMI_EVENT_TRUST_PROXY_HEADERS: v.optional(v.picklist(['true', 'false'])),
})

export const configSchema = v.pipe(
  configInputSchema,
  v.transform((env) => ({
    dataDir: path.resolve(process.cwd(), env.CIMI_DATA_DIR),
    authSecret: env.BETTER_AUTH_SECRET,
    baseUrl: env.BETTER_AUTH_URL,
    isDev: env.NODE_ENV !== 'production',
    eventIngestion: {
      ...(env.CIMI_EVENT_SITE_RATE_PER_SECOND === undefined
        ? {}
        : { siteRatePerSecond: env.CIMI_EVENT_SITE_RATE_PER_SECOND }),
      ...(env.CIMI_EVENT_SITE_BURST === undefined ? {} : { siteBurst: env.CIMI_EVENT_SITE_BURST }),
      ...(env.CIMI_EVENT_SOURCE_IP_RATE_PER_SECOND === undefined
        ? {}
        : { sourceIpRatePerSecond: env.CIMI_EVENT_SOURCE_IP_RATE_PER_SECOND }),
      ...(env.CIMI_EVENT_SOURCE_IP_BURST === undefined
        ? {}
        : { sourceIpBurst: env.CIMI_EVENT_SOURCE_IP_BURST }),
      ...(env.CIMI_EVENT_TRUST_PROXY_HEADERS === undefined
        ? {}
        : { trustProxyHeaders: env.CIMI_EVENT_TRUST_PROXY_HEADERS === 'true' }),
    },
  })),
)

export type AppConfig = v.InferOutput<typeof configSchema>

export class ConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = v.safeParse(configSchema, env)
  if (!result.success) {
    const details = result.issues
      .map((issue) => {
        const key = issue.path?.map((item) => String(item.key)).join('.') || 'configuration'
        return `${key}: ${issue.message}`
      })
      .join('; ')

    throw new ConfigError(`Invalid environment configuration: ${details}`)
  }

  return result.output
}
