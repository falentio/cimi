import {
  configureSync,
  getConsoleSink,
  getConfig,
  getJsonLinesFormatter,
  getLogger,
  withContext,
  type Config,
  type Logger,
} from '@logtape/logtape'
import { DEFAULT_LOG_LEVEL, type LogLevel, type LoggingConfig } from './level.ts'

export { type LogLevel, type LoggingConfig } from './level.ts'

export interface LogError {
  name: string
  message: string
  stack?: string
}

export type LogOperation =
  | 'api.startup'
  | 'backup.create'
  | 'backup.restore'
  | 'backup.cleanup'
  | 'retention.cleanup'
  | 'site.lifecycle'
  | 'installation.upgrade'
  | 'event-ingestion.flush'

export type LogStage =
  | 'admission'
  | 'acquire'
  | 'claim'
  | 'resume-admission'
  | 'resume-reads'
  | 'release'
  | 'shutdown'
  | 'capture'
  | 'drain'
  | 'restore'
  | 'cleanup'
  | 'derived-cleanup'
  | 'backup-cleanup'
  | 'scan'
  | 'execute'
  | 'startup'
  | 'flush'
  | 'rollback'
  | 'record-failure'
  | 'site-delete'
  | 'site-recover'
  | 'site-purge'

export interface LogOperationContext {
  readonly operation: LogOperation
  readonly stage: LogStage
  readonly operationId?: string | undefined
  readonly runId?: string | undefined
  readonly siteId?: string | undefined
  readonly batchSize?: number | undefined
}

export interface LogContext {
  readonly requestId?: string | undefined
  readonly method?: string | undefined
  readonly path?: string | undefined
  readonly procedure?: string | undefined
}

export interface ApiHttpLogEvent {
  readonly kind: 'api.http'
  readonly requestId?: string | undefined
  readonly method: string
  readonly path: string
  readonly status: number
  readonly responseTimeMs: number
  readonly contentLength?: string | undefined
  readonly userAgent?: string | undefined
  readonly referrer?: string | undefined
}

export interface ApiErrorLogEvent {
  readonly kind: 'api.error'
  readonly requestId?: string | undefined
  readonly method?: string | undefined
  readonly path?: string | undefined
  readonly procedure?: string | undefined
  readonly code: string
  readonly status: number
  readonly error?: unknown
}

export interface OperationFailureLogEvent extends LogOperationContext {
  readonly kind: 'operation.failure'
  readonly error: unknown
}

export type HealthOperation = 'admission' | 'store-probe' | 'lifecycle' | 'backup-snapshot'
export type HealthStage =
  | 'fallback'
  | 'control-store'
  | 'analytics-store'
  | 'data-directory'
  | 'snapshot'

export interface HealthFailureLogEvent {
  readonly kind: 'health.failure'
  readonly operation: HealthOperation
  readonly stage: HealthStage
  readonly error: unknown
}

export type LogEvent =
  | ApiHttpLogEvent
  | ApiErrorLogEvent
  | OperationFailureLogEvent
  | HealthFailureLogEvent

export type ApiErrorSeverity = 'info' | 'warning' | 'error'

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

export function withLogContext<T>(context: LogContext, callback: () => T): T {
  return withContext(toLogContext(context), callback)
}

export function normalizeRequestId(value: string): string | null {
  const normalized = safeField(value).trim()
  return normalized === '' ? null : normalized
}

export function reportLogEvent(event: LogEvent): void {
  try {
    const logger = getEventLogger(event)
    const properties = toLogProperties(event)

    switch (event.kind) {
      case 'api.http':
        logger.info('API request', properties)
        return
      case 'api.error':
        logAt(logger, apiErrorSeverity(event.status), 'API request failed', properties)
        return
      case 'operation.failure':
        logger.error('Operation failed', properties)
        return
      case 'health.failure':
        logger.error('Health fallback failed', properties)
        return
    }
  } catch {
    return
  }
}

export function apiErrorSeverity(status: number): ApiErrorSeverity {
  if (status === 401 || status === 404 || status === 409) return 'info'
  if (status >= 400 && status < 500) return 'warning'
  return 'error'
}

export function toLogProperties(event: LogEvent): Record<string, unknown> {
  switch (event.kind) {
    case 'api.http':
      return {
        schemaVersion: 1,
        ...(event.requestId === undefined ? {} : { requestId: safeField(event.requestId) }),
        method: safeMethod(event.method),
        path: safePath(event.path),
        status: safeStatus(event.status),
        responseTime: safeDuration(event.responseTimeMs),
        ...(event.contentLength === undefined
          ? {}
          : { contentLength: safeContentLength(event.contentLength) }),
        ...(event.userAgent === undefined ? {} : { userAgent: safeField(event.userAgent) }),
        ...(event.referrer === undefined
          ? {}
          : (() => {
              const referrer = safeUrl(event.referrer)
              return referrer === undefined ? {} : { referrer }
            })()),
      }
    case 'api.error':
      return {
        schemaVersion: 1,
        ...(event.requestId === undefined ? {} : { requestId: safeField(event.requestId) }),
        ...(event.method === undefined ? {} : { method: safeMethod(event.method) }),
        ...(event.path === undefined ? {} : { path: safePath(event.path) }),
        ...(event.procedure === undefined ? {} : { procedure: safeField(event.procedure) }),
        code: safeField(event.code),
        status: safeStatus(event.status),
        ...(event.error === undefined ? {} : { error: toLogError(event.error) }),
      }
    case 'operation.failure':
      return {
        schemaVersion: 1,
        operation: safeField(event.operation),
        stage: safeField(event.stage),
        ...(event.operationId === undefined ? {} : { operationId: safeField(event.operationId) }),
        ...(event.runId === undefined ? {} : { runId: safeField(event.runId) }),
        ...(event.siteId === undefined ? {} : { siteId: safeField(event.siteId) }),
        ...(event.batchSize === undefined ? {} : { batchSize: safeBatchSize(event.batchSize) }),
        error: toLogError(event.error),
      }
    case 'health.failure':
      return {
        schemaVersion: 1,
        operation: safeField(event.operation),
        stage: safeField(event.stage),
        error: toLogError(event.error),
      }
  }
}

export function toLogError(error: unknown): LogError {
  if (error instanceof Error) {
    return {
      name: safeField(error.name),
      message: safeErrorField(error.message),
      ...(error.stack === undefined ? {} : { stack: safeStack(error.stack) }),
    }
  }

  return { name: 'UnknownError', message: safeErrorField(safeString(error)) }
}

function safeString(value: unknown): string {
  try {
    return String(value).slice(0, 4096)
  } catch {
    return 'Unknown error'
  }
}

function getEventLogger(event: LogEvent): Logger {
  switch (event.kind) {
    case 'api.http':
      return getLogger(['cimi', 'api', 'http'])
    case 'api.error':
      return getLogger(['cimi', 'api'])
    case 'health.failure':
      return getLogger(['cimi', 'api', 'health'])
    case 'operation.failure':
      return getLogger(operationCategory(event.operation))
  }
}

function operationCategory(operation: LogOperation): readonly string[] {
  switch (operation) {
    case 'api.startup':
      return ['cimi', 'api', 'startup']
    case 'backup.create':
    case 'backup.restore':
      return ['cimi', 'api', 'worker', 'backup-restore']
    case 'backup.cleanup':
      return ['cimi', 'api', 'worker', 'backup-restore-cleanup']
    case 'retention.cleanup':
      return ['cimi', 'api', 'worker', 'retention-cleanup']
    case 'site.lifecycle':
      return ['cimi', 'api', 'worker', 'site-lifecycle']
    case 'installation.upgrade':
      return ['cimi', 'api', 'worker', 'installation']
    case 'event-ingestion.flush':
      return ['cimi', 'api', 'worker', 'event-ingestion']
  }
}

function logAt(
  logger: Logger,
  severity: ApiErrorSeverity,
  message: string,
  properties: Record<string, unknown>,
): void {
  switch (severity) {
    case 'info':
      logger.info(message, properties)
      return
    case 'warning':
      logger.warning(message, properties)
      return
    case 'error':
      logger.error(message, properties)
      return
  }
}

function toLogContext(context: LogContext): Record<string, string> {
  return {
    ...(context.requestId === undefined ? {} : { requestId: safeField(context.requestId) }),
    ...(context.method === undefined ? {} : { method: safeMethod(context.method) }),
    ...(context.path === undefined ? {} : { path: safePath(context.path) }),
    ...(context.procedure === undefined ? {} : { procedure: safeField(context.procedure) }),
  }
}

function safeField(value: string): string {
  return sanitize(value, 256)
}

function safeErrorField(value: string): string {
  return sanitize(value, 512)
}

function safeStack(value: string): string {
  return sanitize(value, 4096)
}

function safeMethod(value: string): string {
  const method = normalizeControlCharacters(value.slice(0, 32)).trim().toUpperCase()
  return ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'].includes(method)
    ? method
    : 'UNKNOWN'
}

function safePath(value: string): string {
  const normalized = normalizeControlCharacters(value.slice(0, 1024)).slice(0, 1024)
  try {
    return new URL(normalized, 'http://localhost').pathname.slice(0, 256) || '/'
  } catch {
    return redactCredentials(normalized).split(/[?#]/, 1)[0]?.slice(0, 256) || '/'
  }
}

function safeUrl(value: string): string | undefined {
  if (value.length > 1024 && value.slice(1024).includes('@')) return undefined
  const normalized = normalizeControlCharacters(value.slice(0, 1024)).slice(0, 1024)
  try {
    const url = new URL(normalized)
    return `${url.origin}${url.pathname}`.slice(0, 256)
  } catch {
    return undefined
  }
}

function safeStatus(value: number): number {
  return Number.isInteger(value) && value >= 100 && value <= 599 ? value : 500
}

function safeDuration(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : 0
}

function safeContentLength(value: string): string | undefined {
  const normalized = normalizeControlCharacters(value.slice(0, 32)).trim()
  return /^\d+$/.test(normalized) ? normalized.slice(0, 20) : undefined
}

function sanitize(value: string, limit: number): string {
  return redactCredentials(normalizeControlCharacters(value.slice(0, limit + 1024))).slice(0, limit)
}

function safeBatchSize(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0
}

function normalizeControlCharacters(value: string): string {
  let normalized = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    const code = character?.charCodeAt(0) ?? 0
    normalized +=
      code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x2028 || code === 0x2029
        ? ' '
        : character
  }
  return normalized
}

function redactCredentials(value: string): string {
  return value
    .replace(/:\/\/[^/@\s]+@/g, '://[REDACTED]@')
    .replace(/\bBearer\s+[^\s,]+/gi, 'Bearer [REDACTED]')
    .replace(/\bBasic\s+[^\s,]+/gi, 'Basic [REDACTED]')
    .replace(
      /(["']?)(password|passwd|secret|client[_-]?secret|private[_-]?key|signature|sig|state|nonce|token|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|cookie|code)\1\s*([=:])\s*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^,\s}&]+)/gi,
      '$1$2$1$3[REDACTED]',
    )
    .replace(/\bhttps?:\/\/[^\s"'<>]+/gi, (url) => url.split(/[?#]/, 1)[0] ?? url)
    .replace(/([/?][^\s"'<>?#]+)[?#][^\s"'<>]*/g, '$1')
}
