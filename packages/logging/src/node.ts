import { AsyncLocalStorage } from 'node:async_hooks'
import { configureSync, getConfig } from '@logtape/logtape'
import { createLoggingConfiguration, type LoggingConfig } from './index.ts'
import { DEFAULT_LOG_LEVEL, type LogLevel } from './level.ts'

let configuredLevel: LogLevel | undefined

export function configureNodeLogging(logging?: LoggingConfig): void {
  const lowestLevel = logging?.lowestLevel ?? DEFAULT_LOG_LEVEL

  if (configuredLevel !== undefined && getConfig() !== null) {
    if (configuredLevel !== lowestLevel) {
      throw new Error(
        `Node logging is already configured at ${configuredLevel}, cannot change it to ${lowestLevel}`,
      )
    }

    return
  }

  configureSync({
    ...createLoggingConfiguration(logging),
    // eslint-disable-next-line anti-slop/no-unsafe-dictionary-type -- logtape owns ContextLocalStorage<Record<string, unknown>>.
    contextLocalStorage: new AsyncLocalStorage<Record<string, unknown>>(),
  })
  configuredLevel = lowestLevel
}
