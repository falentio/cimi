import path from 'node:path'
import * as v from 'valibot'

const configInputSchema = v.object({
  CIMI_DATA_DIR: v.optional(v.pipe(v.string(), v.nonEmpty()), '.cimi'),
  BETTER_AUTH_SECRET: v.pipe(v.string(), v.nonEmpty()),
  BETTER_AUTH_URL: v.optional(v.pipe(v.string(), v.url()), 'http://localhost:4321'),
  NODE_ENV: v.optional(v.picklist(['development', 'test', 'production']), 'development'),
})

export const configSchema = v.pipe(
  configInputSchema,
  v.transform(({ CIMI_DATA_DIR, BETTER_AUTH_SECRET, BETTER_AUTH_URL, NODE_ENV }) => ({
    dataDir: path.resolve(process.cwd(), CIMI_DATA_DIR),
    authSecret: BETTER_AUTH_SECRET,
    baseUrl: BETTER_AUTH_URL,
    isDev: NODE_ENV !== 'production',
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
