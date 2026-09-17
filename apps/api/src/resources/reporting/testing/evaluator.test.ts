import { describe, expect, it } from 'vitest'
import type { AnalyticsReportEvent, AnalyticsReportSession, JsonObject } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { createCalendarDate, createInstantMs, type ResolvedPeriod } from '@cimi/kernel'
import type { InferOutput } from 'valibot'
import { evaluateRetention } from '../../cohort-retention/evaluator.ts'
import { evaluateFunnel } from '../../funnel/evaluator.ts'
import { evaluateGoal } from '../../goal/evaluator.ts'
import type { EvaluationPeriod, IdentityScope, ReportEvent, ReportSnapshot } from '../model.ts'
import type { ReportEvaluationInput } from '../evaluation.ts'

type EventKind = InferOutput<typeof contractSchema.SEventKind>

const period: EvaluationPeriod = {
  period: resolvedPeriod('2026-09-01', '2026-09-01'),
  sequence: null,
}

function resolvedPeriod(fromDate: string, toDate: string): ResolvedPeriod {
  return {
    key: 'current',
    dates: { fromDate: createCalendarDate(fromDate), toDate: createCalendarDate(toDate) },
    interval: {
      start: createInstantMs(Date.parse(`${fromDate}T00:00:00.000Z`)),
      endExclusive: createInstantMs(Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000),
    },
    calendarDays: 1,
    bucketStarts: null,
  }
}

function session(
  input: Partial<AnalyticsReportSession> & Pick<AnalyticsReportSession, 'sessionId'>,
): AnalyticsReportSession {
  return {
    sessionId: input.sessionId,
    visitorId: input.visitorId ?? null,
    identifiedUserId: input.identifiedUserId ?? null,
    startedAt: input.startedAt ?? new Date('2026-09-01T10:00:00.000Z'),
    endedAt: input.endedAt ?? new Date('2026-09-01T10:05:00.000Z'),
    entryPage: input.entryPage ?? '/',
    exitPage: input.exitPage ?? '/done',
    referrer: input.referrer ?? null,
    utmSource: input.utmSource ?? null,
    utmMedium: input.utmMedium ?? null,
    utmCampaign: input.utmCampaign ?? null,
    device: input.device ?? null,
    browser: input.browser ?? null,
    operatingSystem: input.operatingSystem ?? null,
    country: input.country ?? null,
    region: input.region ?? null,
    city: input.city ?? null,
  }
}

function event(
  input: Partial<AnalyticsReportEvent> &
    Pick<AnalyticsReportEvent, 'eventId' | 'sessionId'> & { readonly eventKind: EventKind },
): ReportEvent {
  return {
    eventId: input.eventId,
    eventKind: input.eventKind,
    occurrenceTime: input.occurrenceTime ?? new Date('2026-09-01T10:01:00.000Z'),
    visitorId: input.visitorId ?? null,
    identifiedUserId: input.identifiedUserId ?? null,
    sessionId: input.sessionId,
    pagePath: input.pagePath ?? '/',
    referrer: input.referrer ?? null,
    name: input.name ?? null,
    destination: input.destination ?? null,
    unit: input.unit ?? null,
    code: input.code ?? null,
    properties: input.properties ?? {},
  }
}

function snapshot(
  sessions: readonly AnalyticsReportSession[],
  events: readonly ReportEvent[],
  activeProfiles: ReadonlyMap<
    string,
    { readonly identifiedUserId: string; readonly traits: JsonObject }
  > = new Map(),
): ReportSnapshot {
  return { sessions, events, activeProfiles }
}

function inputFor(
  current: ReportSnapshot,
  identityKind: 'visitor' | 'identified_user',
  filters?: ReportEvaluationInput['filters'],
  evaluationPeriod: EvaluationPeriod = period,
): ReportEvaluationInput {
  const identity: IdentityScope = {
    kind: identityKind,
    subjectOfEvent: (value) =>
      identityKind === 'visitor'
        ? value.visitorId
        : value.identifiedUserId !== null && current.activeProfiles.has(value.identifiedUserId)
          ? value.identifiedUserId
          : null,
    subjectOfSession: (value) =>
      identityKind === 'visitor'
        ? value.visitorId
        : value.identifiedUserId !== null && current.activeProfiles.has(value.identifiedUserId)
          ? value.identifiedUserId
          : null,
    sessionIsEligible: (value) =>
      identityKind === 'visitor'
        ? value.visitorId !== null
        : value.identifiedUserId !== null && current.activeProfiles.has(value.identifiedUserId),
  }
  return { snapshot: current, identity, filters, period: evaluationPeriod }
}

describe('reporting evaluators', () => {
  it('keeps visitor and identified-user populations separate', () => {
    const visitorSession = session({ sessionId: 'ses-v', visitorId: 'vis-1' })
    const userSession = session({
      sessionId: 'ses-u',
      visitorId: 'vis-2',
      identifiedUserId: 'usr-1',
    })
    const events = [
      event({
        eventId: 'evt-v',
        sessionId: 'ses-v',
        eventKind: 'custom_event',
        name: 'signup',
        visitorId: 'vis-1',
      }),
      event({
        eventId: 'evt-u',
        sessionId: 'ses-u',
        eventKind: 'custom_event',
        name: 'signup',
        visitorId: 'vis-2',
        identifiedUserId: 'usr-1',
      }),
    ]
    const profiles = new Map([['usr-1', { identifiedUserId: 'usr-1', traits: {} }]])
    const visitorSnapshot = snapshot([visitorSession, userSession], events, profiles)
    const action = { kind: 'custom_event' as const, name: 'signup' }

    expect(
      evaluateGoal({
        ...inputFor(visitorSnapshot, 'visitor'),
        definition: { action, propertyFilters: undefined },
      }),
    ).toEqual({ conversions: 2, eligibleSessions: 2 })
    expect(
      evaluateGoal({
        ...inputFor(visitorSnapshot, 'identified_user'),
        definition: { action, propertyFilters: undefined },
      }),
    ).toEqual({ conversions: 1, eligibleSessions: 1 })
  })

  it('applies active profile trait filters and leaves missing traits unmatched', () => {
    const first = session({ sessionId: 'ses-pro', visitorId: 'vis-1', identifiedUserId: 'usr-1' })
    const second = session({
      sessionId: 'ses-redacted',
      visitorId: 'vis-2',
      identifiedUserId: 'usr-2',
    })
    const current = snapshot(
      [first, second],
      [
        event({
          eventId: 'evt-pro',
          sessionId: 'ses-pro',
          eventKind: 'page_view',
          visitorId: 'vis-1',
          identifiedUserId: 'usr-1',
        }),
        event({
          eventId: 'evt-redacted',
          sessionId: 'ses-redacted',
          eventKind: 'page_view',
          visitorId: 'vis-2',
          identifiedUserId: 'usr-2',
        }),
      ],
      new Map([['usr-1', { identifiedUserId: 'usr-1', traits: { plan: 'pro' } }]]),
    )

    expect(
      evaluateGoal({
        ...inputFor(current, 'identified_user', [
          { scope: 'profile', field: 'trait.plan', operator: 'equals', values: ['pro'] },
        ]),
        definition: { action: { kind: 'page_view' }, propertyFilters: undefined },
      }),
    ).toEqual({ conversions: 1, eligibleSessions: 1 })
  })

  it('treats a redacted identified session as anonymous for visitor filters', () => {
    const current = snapshot(
      [session({ sessionId: 'ses-redacted', visitorId: 'vis-1', identifiedUserId: 'usr-1' })],
      [
        event({
          eventId: 'evt-redacted',
          sessionId: 'ses-redacted',
          eventKind: 'page_view',
          visitorId: 'vis-1',
          identifiedUserId: 'usr-1',
        }),
      ],
    )

    expect(
      evaluateGoal({
        ...inputFor(current, 'visitor', [
          { scope: 'visitor', field: 'identityKind', operator: 'equals', values: ['visitor'] },
        ]),
        definition: { action: { kind: 'page_view' }, propertyFilters: undefined },
      }),
    ).toEqual({ conversions: 1, eligibleSessions: 1 })
  })

  it('requires funnel steps in order within one server-defined Session', () => {
    const current = snapshot(
      [session({ sessionId: 'ses-1', visitorId: 'vis-1' })],
      [
        event({
          eventId: 'evt-2',
          sessionId: 'ses-1',
          eventKind: 'custom_event',
          name: 'second',
          visitorId: 'vis-1',
        }),
        event({ eventId: 'evt-1', sessionId: 'ses-1', eventKind: 'page_view', visitorId: 'vis-1' }),
      ],
    )

    expect(
      evaluateFunnel({
        ...inputFor(current, 'visitor'),
        definition: { steps: [{ kind: 'page_view' }, { kind: 'custom_event', name: 'second' }] },
      }),
    ).toEqual([
      { matched: 1, rateFromEntry: 1, rateFromPrevious: 1 },
      { matched: 1, rateFromEntry: 1, rateFromPrevious: 1 },
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
