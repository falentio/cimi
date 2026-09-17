import {
  configureSync,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  type Config,
} from '@logtape/logtape'

export { getLogger }

export interface LogError {
  name: string
  message: string
  stack?: string
}

export function createLoggingConfiguration(): Config<'console', string> {
  return {
    sinks: {
      console: getConsoleSink({ formatter: getJsonLinesFormatter() }),
    },
    loggers: [
      {
        category: ['cimi'],
        lowestLevel: 'info',
        sinks: ['console'],
      },
    ],
  }
}

export function configureBrowserLogging(): void {
  configureSync(createLoggingConfiguration())
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
