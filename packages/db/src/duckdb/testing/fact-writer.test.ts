import { describe, expect, it } from 'vitest'
import { DuckDBTimestampValue, type DuckDBValue } from '@duckdb/node-api'
import {
  EVENT_APPEND_COLUMNS,
  appendEventRows,
  appendPropertyRows,
  appendSessionRows,
  appendVisitorRows,
  assertAppenderMatchesSchema,
  type FactAppender,
} from '../fact-writer.ts'
import type { PropertyRow, ProjectedEventRow } from '../projection-source.ts'
import type { SessionRow, VisitorRow } from '../projection-fold.ts'

const OCCURRENCE_MS = Date.parse('2026-09-05T00:00:00.000Z')

const RECEIPT_MS = Date.parse('2026-09-05T00:00:01.000Z')

function micros(milliseconds: number): DuckDBTimestampValue {
  return new DuckDBTimestampValue(BigInt(milliseconds) * 1000n)
}

class RecordingAppender implements FactAppender {
  readonly columnCount: number
  readonly rows: DuckDBValue[][] = []
  private current: DuckDBValue[] = []

  constructor(columnCount: number) {
    this.columnCount = columnCount
  }

  appendBigInt(value: bigint): void {
    this.current.push(value)
  }

  appendVarchar(value: string): void {
    this.current.push(value)
  }

  appendTimestamp(value: DuckDBTimestampValue): void {
    this.current.push(value)
  }

  appendBoolean(value: boolean): void {
    this.current.push(value)
  }

  appendDouble(value: number): void {
    this.current.push(value)
  }

  appendNull(): void {
    this.current.push(null)
  }

  endRow(): void {
    this.rows.push(this.current)
    this.current = []
  }

  closeSync(): void {}
}

function event(overrides: Partial<ProjectedEventRow> = {}): ProjectedEventRow {
  return {
    eventPk: 7,
    siteId: 'ste-1',
    eventId: 'evt-7',
    eventKind: 'page_view',
    occurrenceTime: OCCURRENCE_MS,
    receiptTime: RECEIPT_MS,
    late: 0,
    visitorId: 'vis-1',
    anonymousIdentityId: 'anon-1',
    identifiedUserId: null,
    analyticsSessionId: 'ses-1',
    botPolicyOutcome: 'included',
    policyRevisionId: 'pol-1',
    replaySequence: 7,
    payloadFingerprint: 'fingerprint-7',
    projectionState: 'pending',
    projectedAt: null,
    pagePath: '/home',
    referrer: null,
    name: null,
    destination: null,
    value: null,
    unit: null,
    code: null,
    message: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    deviceType: null,
    browserType: null,
    operatingSystem: null,
    country: null,
    canonicalPayloadJson: null,
    profileId: null,
    ...overrides,
  }
}

describe('assertAppenderMatchesSchema', () => {
  it('accepts an appender exposing the events column count', () => {
    const appender = new RecordingAppender(EVENT_APPEND_COLUMNS.length)

    expect(() => assertAppenderMatchesSchema(appender, 'events')).not.toThrow()
  })

  it('names the drifted table when an ALTER TABLE adds a column', () => {
    const appender = new RecordingAppender(EVENT_APPEND_COLUMNS.length + 1)

    expect(() => assertAppenderMatchesSchema(appender, 'events')).toThrow(/events schema changed/)
  })
})

describe('appendEventRows', () => {
  it('appends every events column in physical order with timestamps as micros', async () => {
    const appender = new RecordingAppender(EVENT_APPEND_COLUMNS.length)

    await appendEventRows(appender, [event({ value: 12.5 })], new Map())

    expect(appender.rows).toHaveLength(1)

    const [row] = appender.rows

    expect(row).toHaveLength(32)
    expect(row?.[0]).toBe(7n)
    expect(row?.[1]).toBe('ste-1')
    expect(row?.[4]).toEqual(micros(OCCURRENCE_MS))
    expect(row?.[5]).toEqual(micros(RECEIPT_MS))
    expect(row?.[6]).toBe(false)
    expect(row?.[7]).toBe('vis-1')
    expect(row?.[14]).toBe(12.5)
    expect(row?.[18]).toBeNull()
    expect(row?.[19]).toBe('pol-1')
    expect(row?.[20]).toBe(7n)
    expect(row?.[22]).toBeNull()
    expect(row?.[31]).toBeNull()
  })

  it('appends the property blob as JSON text and null when the event has none', async () => {
    const appender = new RecordingAppender(EVENT_APPEND_COLUMNS.length)

    await appendEventRows(appender, [event()], new Map([[7, { plan: 'pro' }]]))

    expect(appender.rows[0]?.[18]).toBe('{"plan":"pro"}')
  })
})

describe('appendPropertyRows', () => {
  it('copies site and event identity from the written event and skips unwritten ones', async () => {
    const appender = new RecordingAppender(7)

    const properties: PropertyRow[] = [
      {
        eventPk: 7,
        propertyKey: 'plan',
        valueType: 'string',
        stringValue: 'pro',
        numberValue: null,
        booleanValue: null,
      },
      {
        eventPk: 99,
        propertyKey: 'orphan',
        valueType: 'string',
        stringValue: 'never-written',
        numberValue: null,
        booleanValue: null,
      },
    ]

    await appendPropertyRows(appender, properties, [event()])

    expect(appender.rows).toEqual([['ste-1', 'evt-7', 'plan', 'string', 'pro', null, null]])
  })

  it('appends a boolean value as a boolean', async () => {
    const appender = new RecordingAppender(7)

    const properties: PropertyRow[] = [
      {
        eventPk: 7,
        propertyKey: 'trial',
        valueType: 'boolean',
        stringValue: null,
        numberValue: null,
        booleanValue: 1,
      },
    ]

    await appendPropertyRows(appender, properties, [event()])

    expect(appender.rows[0]?.[6]).toBe(true)
  })
})

describe('appendVisitorRows', () => {
  it('appends the visitor columns', async () => {
    const appender = new RecordingAppender(6)

    const visitor: VisitorRow = {
      siteId: 'ste-1',
      visitorId: 'vis-1',
      identityKind: 'identified',
      profileId: 'profile-1',
      firstSeenAt: OCCURRENCE_MS,
      lastSeenAt: Date.parse('2026-09-05T00:00:09.000Z'),
    }

    await appendVisitorRows(appender, [visitor])

    expect(appender.rows).toEqual([
      [
        'ste-1',
        'vis-1',
        'identified',
        micros(OCCURRENCE_MS),
        micros(Date.parse('2026-09-05T00:00:09.000Z')),
        'profile-1',
      ],
    ])
  })
})

describe('appendSessionRows', () => {
  it('appends the session columns with region and city left to their owner', async () => {
    const appender = new RecordingAppender(17)

    const session: SessionRow = {
      siteId: 'ste-1',
      sessionId: 'ses-1',
      visitorId: 'vis-1',
      identifiedUserId: 'user-1',
      startedAt: OCCURRENCE_MS,
      endedAt: Date.parse('2026-09-05T00:00:04.000Z'),
      entryPage: '/home',
      referrer: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      device: null,
      browser: null,
      operatingSystem: null,
      country: null,
    }

    await appendSessionRows(appender, [session])

    expect(appender.rows).toEqual([
      [
        'ste-1',
        'ses-1',
        'vis-1',
        'user-1',
        micros(OCCURRENCE_MS),
        micros(Date.parse('2026-09-05T00:00:04.000Z')),
        '/home',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
    ])
  })
})
