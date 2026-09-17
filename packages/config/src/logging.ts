import { DEFAULT_LOG_LEVEL, getLogLevels, type LoggingConfig } from '@cimi/logging/level'
import * as v from 'valibot'
import { parseConfig } from './parse.ts'

export const loggingInputSchema = {
  CIMI_LOG_LEVEL: v.optional(v.picklist(getLogLevels()), DEFAULT_LOG_LEVEL),
}

const loggingConfigSchema = v.object({
  lowestLevel: v.picklist(getLogLevels()),
})

const loggingEnvironmentSchema = v.pipe(
  v.object(loggingInputSchema),
  v.transform((env): LoggingConfig => toLoggingConfig(env.CIMI_LOG_LEVEL)),
)

export function loadLoggingConfig(
  env: Record<string, string | undefined> = process.env,
): LoggingConfig {
  return parseConfig(loggingEnvironmentSchema, env, 'environment')
}

export function parseLoggingConfig(input: unknown): LoggingConfig {
  return parseConfig(loggingConfigSchema, input, 'logging')
}

export function toLoggingConfig(lowestLevel: LoggingConfig['lowestLevel']): LoggingConfig {
  return { lowestLevel }
}
