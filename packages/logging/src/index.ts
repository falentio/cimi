import {
  configureSync,
  getConsoleSink,
  getConfig,
  getJsonLinesFormatter,
  getLogger,
  type Config,
} from '@logtape/logtape'
import { DEFAULT_LOG_LEVEL, type LogLevel, type LoggingConfig } from './level.ts'

export { getLogger }
export { type LogLevel, type LoggingConfig } from './level.ts'

export interface LogError {
  name: string
  message: string
  stack?: string
}

let configuredBrowserLevel: LogLevel | undefined

export function createLoggingConfiguration(
  logging: LoggingConfig = { lowestLevel: DEFAULT_LOG_LEVEL },
): Config<'console', string> {
  return {
    sinks: {
      console: getConsoleSink({ formatter: getJsonLinesFormatter() }),
    },
    loggers: [
      {
        category: ['cimi'],
        lowestLevel: logging.lowestLevel,
        sinks: ['console'],
      },
    ],
  }
}

export function configureBrowserLogging(logging?: LoggingConfig): void {
  const lowestLevel = logging?.lowestLevel ?? DEFAULT_LOG_LEVEL
  if (configuredBrowserLevel !== undefined && getConfig() !== null) {
    if (configuredBrowserLevel !== lowestLevel) {
      throw new Error(
        `Browser logging is already configured at ${configuredBrowserLevel}, cannot change it to ${lowestLevel}`,
      )
    }
    return
  }

  configureSync(createLoggingConfiguration(logging))
  configuredBrowserLevel = lowestLevel
}

export function toLogError(error: unknown): LogError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack === undefined ? {} : { stack: error.stack }),
    }
  }

  return { name: 'UnknownError', message: safeString(error) }
}

function safeString(value: unknown): string {
  try {
    return String(value)
  } catch {
    return 'Unknown error'
  }
}
