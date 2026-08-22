import path from 'node:path'

export interface AppConfig {
  dataDir: string
  authSecret: string
  baseUrl: string
  isDev: boolean
}

export class ConfigError extends Error {}

const REQUIRED_VARS = ['BETTER_AUTH_SECRET'] as const

function isMissing(value: string | undefined): boolean {
  return value === undefined || value === ''
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const missing = REQUIRED_VARS.filter((name) => isMissing(env[name]))
  if (missing.length > 0) {
    throw new ConfigError(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return {
    dataDir: path.resolve(process.cwd(), env['CIMI_DATA_DIR'] ?? '.cimi'),
    authSecret: env['BETTER_AUTH_SECRET'] ?? '',
    baseUrl: env['BETTER_AUTH_URL'] ?? 'http://localhost:4321',
    isDev: (env['NODE_ENV'] ?? 'development') !== 'production',
  }
}
