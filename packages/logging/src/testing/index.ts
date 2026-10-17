import { configureSync, getConfig, resetSync, type LogRecord, type Sink } from '@logtape/logtape'

export interface CapturedLogRecord {
  readonly message: string
  readonly properties: LogRecord['properties']
}

export interface LogCapture {
  readonly records: CapturedLogRecord[]
  stop(): void
}

/**
 * Captures the events \`reportLogEvent\` writes, so a test can assert what an operation reported
 * instead of inferring it. The capture stays installed until \`stop\`.
 */
export function captureLogEvents(): LogCapture {
  const records: CapturedLogRecord[] = []
  const previous = getConfig()

  const sink: Sink = (record: LogRecord) => {
    records.push({
      message: record.message.map((part) => String(part)).join(''),
      properties: record.properties,
    })
  }

  configureSync({
    reset: true,
    sinks: { capture: sink },
    loggers: [{ category: 'cimi', sinks: ['capture'], lowestLevel: 'debug' }],
  })

  return {
    records,
    stop() {
      if (previous === null) {
        resetSync()

        return
      }

      configureSync({ ...previous, reset: true })
    },
  }
}
