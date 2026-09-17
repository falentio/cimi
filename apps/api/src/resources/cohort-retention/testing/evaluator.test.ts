import { expect, it } from 'vitest'
import { createCalendarDate, createInstantMs, type ResolvedPeriod } from '@cimi/kernel'
import type {
  IdentityScope,
  ReportEvent,
  ReportSession,
  ReportSnapshot,
} from '../../reporting/model.ts'
import { evaluateRetention } from '../evaluator.ts'

it('uses the historical identity scope for each retention period', () => {
  const firstPeriod = day('2026-09-01')
  const secondPeriod = day('2026-09-02')
  const snapshot = reportSnapshot()
  const visitor = identityScope('visitor')
  const identifiedUser = identityScope('identified_user')

  const result = evaluateRetention({
    period: { period: { ...firstPeriod, key: 'current' }, sequence: [firstPeriod, secondPeriod] },
    snapshot,
    identity: visitor,
    identityForPeriod: (period) =>
      period.interval.start === firstPeriod.interval.start ? visitor : identifiedUser,
    filters: undefined,
    definition: {
      entryAction: { kind: 'custom_event', name: 'signup' },
      retentionAction: { kind: 'custom_event', name: 'purchase' },
    },
  })

  expect(result).toMatchObject([
    { index: 0, size: 1, retained: 0 },
    { index: 1, size: 1, retained: 1, rate: 1 },
  ])
})

function day(value: string): ResolvedPeriod {
  const start = Date.parse(`${value}T00:00:00.000Z`)
  return {
    key: 'current',
    dates: { fromDate: createCalendarDate(value), toDate: createCalendarDate(value) },
    interval: {
      start: createInstantMs(start),
      endExclusive: createInstantMs(start + 24 * 60 * 60 * 1000),
    },
    calendarDays: 1,
    bucketStarts: null,
  }
}

function identityScope(kind: IdentityScope['kind']): IdentityScope {
  return {
    kind,
    subjectOfEvent: (event) => (kind === 'visitor' ? event.visitorId : event.identifiedUserId),
    subjectOfSession: (session) =>
      kind === 'visitor' ? session.visitorId : session.identifiedUserId,
    sessionIsEligible: (session) =>
      (kind === 'visitor' ? session.visitorId : session.identifiedUserId) !== null,
  }
}

function reportSnapshot(): ReportSnapshot {
  const entrySession: ReportSession = {
    sessionId: 'ses-entry',
    visitorId: 'vis-entry',
    identifiedUserId: 'usr-1',
    startedAt: new Date('2026-09-01T10:00:00.000Z'),
    endedAt: new Date('2026-09-01T10:05:00.000Z'),
    entryPage: '/',
    exitPage: '/',
    referrer: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    device: null,
    browser: null,
    operatingSystem: null,
    country: null,
    region: null,
    city: null,
  }
  const retentionSession: ReportSession = {
    ...entrySession,
    sessionId: 'ses-retention',
    visitorId: 'vis-retention',
    startedAt: new Date('2026-09-02T10:00:00.000Z'),
    endedAt: new Date('2026-09-02T10:05:00.000Z'),
  }
  const entryEvent: ReportEvent = {
    eventId: 'evt-entry',
    eventKind: 'custom_event',
    occurrenceTime: new Date('2026-09-01T10:01:00.000Z'),
    visitorId: 'vis-entry',
    identifiedUserId: 'usr-1',
    sessionId: 'ses-entry',
    pagePath: '/',
    referrer: null,
    name: 'signup',
    destination: null,
    unit: null,
    code: null,
    properties: {},
  }
  const retentionEvent: ReportEvent = {
    ...entryEvent,
    eventId: 'evt-retention',
    occurrenceTime: new Date('2026-09-02T10:01:00.000Z'),
    visitorId: 'vis-retention',
    sessionId: 'ses-retention',
    name: 'purchase',
  }
  return {
    sessions: [entrySession, retentionSession],
    events: [entryEvent, retentionEvent],
    activeProfiles: new Map([['usr-1', { identifiedUserId: 'usr-1', traits: {} }]]),
  }
}
