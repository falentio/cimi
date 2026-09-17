import { getLogLevels, type LogLevel } from '@logtape/logtape'

export { getLogLevels, type LogLevel }

export const DEFAULT_LOG_LEVEL = 'info' satisfies LogLevel

export interface LoggingConfig {
  readonly lowestLevel: LogLevel
}
