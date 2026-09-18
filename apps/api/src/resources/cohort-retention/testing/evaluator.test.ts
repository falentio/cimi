import { describe, expect, it } from 'vitest'
import { createCalendarDate, createInstantMs, type ResolvedPeriod } from '@cimi/kernel'
import type {
  EvaluationPeriod,
  IdentityScope,
  ReportEvent,
  ReportSession,
  ReportSnapshot,
} from '../../reporting/model.ts'
import { evaluateRetention } from '../evaluator.ts'
import {
  event,
  inputFor,
  resolvedPeriod,
  session,
  snapshot,
} from '../../reporting/testing/evaluator-fixture.ts'

describe('evaluateRetention', () => {
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

  it('uses the historical entry action and identity for each entry period', () => {
    const firstPeriod = day('2026-09-01')
    const secondPeriod = day('2026-09-02')
    const snapshot = reportSnapshot()
    const visitor = identityScope('visitor')
    const identifiedUser = identityScope('identified_user')
    const outerPeriod: ResolvedPeriod = {
      ...firstPeriod,
      dates: {
        fromDate: createCalendarDate('2026-09-01'),
        toDate: createCalendarDate('2026-09-02'),
      },
      interval: {
        start: firstPeriod.interval.start,
        endExclusive: secondPeriod.interval.endExclusive,
      },
      calendarDays: 2,
    }

    const result = evaluateRetention({
      period: { period: outerPeriod, sequence: [firstPeriod, secondPeriod] },
      snapshot,
      identity: visitor,
      identityForPeriod: (period) =>
        period.interval.start === firstPeriod.interval.start ? visitor : identifiedUser,
      filters: undefined,
      definition: {
        entryAction: { kind: 'custom_event', name: 'signup' },
        retentionAction: { kind: 'custom_event', name: 'purchase' },
      },
      definitionForPeriod: (period) =>
        period.interval.start === firstPeriod.interval.start
          ? {
              entryAction: { kind: 'custom_event', name: 'signup' },
              retentionAction: { kind: 'custom_event', name: 'purchase' },
            }
          : {
              entryAction: { kind: 'custom_event', name: 'purchase' },
              retentionAction: { kind: 'custom_event', name: 'purchase' },
            },
    })

    expect(result).toMatchObject([
      { index: 0, size: 2, retained: 0, rate: 0 },
      { index: 1, size: 2, retained: 2, rate: 1 },
    ])
  })

  it('emits zero-retention periods and counts an entry only once per subject', () => {
    const first = session({
      sessionId: 'ses-1',
      visitorId: 'vis-1',
      endedAt: new Date('2026-09-02T10:05:00.000Z'),
    })
    const current = snapshot(
      [first],
      [
        event({
          eventId: 'entry-1',
          sessionId: 'ses-1',
          eventKind: 'custom_event',
          name: 'entry',
          visitorId: 'vis-1',
        }),
        event({
          eventId: 'entry-2',
          sessionId: 'ses-1',
          eventKind: 'custom_event',
          name: 'entry',
          visitorId: 'vis-1',
          occurrenceTime: new Date('2026-09-01T10:02:00.000Z'),
        }),
        event({
          eventId: 'repeat',
          sessionId: 'ses-1',
          eventKind: 'custom_event',
          name: 'repeat',
          visitorId: 'vis-1',
          occurrenceTime: new Date('2026-09-02T10:01:00.000Z'),
        }),
      ],
    )
    const evaluationPeriod: EvaluationPeriod = {
      period: resolvedPeriod('2026-09-01', '2026-09-02'),
      sequence: [
        resolvedPeriod('2026-09-01', '2026-09-01'),
        resolvedPeriod('2026-09-02', '2026-09-02'),
      ],
    }

    expect(
      evaluateRetention({
        ...inputFor(current, 'visitor', undefined, evaluationPeriod),
        definition: {
          entryAction: { kind: 'custom_event', name: 'entry' },
          retentionAction: { kind: 'custom_event', name: 'repeat' },
        },
      }),
    ).toEqual([
      { index: 0, fromDate: '2026-09-01', toDate: '2026-09-01', size: 1, retained: 0, rate: 0 },
      { index: 1, fromDate: '2026-09-02', toDate: '2026-09-02', size: 1, retained: 1, rate: 1 },
    ])
  })

  it('applies report filters to cohort membership without filtering later retention sessions', () => {
    const entrySession = session({
      sessionId: 'ses-entry',
      visitorId: 'vis-1',
      device: 'desktop',
      startedAt: new Date('2026-09-01T10:00:00.000Z'),
      endedAt: new Date('2026-09-01T10:05:00.000Z'),
    })
    const retentionSession = session({
      sessionId: 'ses-retention',
      visitorId: 'vis-1',
      device: 'mobile',
      startedAt: new Date('2026-09-02T10:00:00.000Z'),
      endedAt: new Date('2026-09-02T10:05:00.000Z'),
    })
    const current = snapshot(
      [entrySession, retentionSession],
      [
        event({
          eventId: 'entry',
          sessionId: 'ses-entry',
          eventKind: 'custom_event',
          name: 'entry',
          visitorId: 'vis-1',
          occurrenceTime: new Date('2026-09-01T10:01:00.000Z'),
        }),
        event({
          eventId: 'repeat',
          sessionId: 'ses-retention',
          eventKind: 'custom_event',
          name: 'repeat',
          visitorId: 'vis-1',
          occurrenceTime: new Date('2026-09-02T10:01:00.000Z'),
        }),
      ],
    )
    const evaluationPeriod: EvaluationPeriod = {
      period: resolvedPeriod('2026-09-01', '2026-09-02'),
      sequence: [
        resolvedPeriod('2026-09-01', '2026-09-01'),
        resolvedPeriod('2026-09-02', '2026-09-02'),
      ],
    }

    expect(
      evaluateRetention({
        ...inputFor(
          current,
          'visitor',
          [{ scope: 'session', field: 'device', operator: 'equals', values: ['desktop'] }],
          evaluationPeriod,
        ),
        definition: {
          entryAction: { kind: 'custom_event', name: 'entry' },
          retentionAction: { kind: 'custom_event', name: 'repeat' },
        },
      }),
    ).toEqual([
      { index: 0, fromDate: '2026-09-01', toDate: '2026-09-01', size: 1, retained: 0, rate: 0 },
      { index: 1, fromDate: '2026-09-02', toDate: '2026-09-02', size: 1, retained: 1, rate: 1 },
    ])
  })
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
