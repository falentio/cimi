import type { AnalyticsReportEvent, AnalyticsReportSession, JsonObject } from '@cimi/db'
import { schema as contractSchema } from '@cimi/contract'
import { createCalendarDate, createInstantMs, type ResolvedPeriod } from '@cimi/kernel'
import type { InferOutput } from 'valibot'
import type { EvaluationPeriod, IdentityScope, ReportEvent, ReportSnapshot } from '../model.ts'
import type { ReportEvaluationInput } from '../evaluation.ts'

type EventKind = InferOutput<typeof contractSchema.SEventKind>

export const period: EvaluationPeriod = {
  period: resolvedPeriod('2026-09-01', '2026-09-01'),
  sequence: null,
}

export function resolvedPeriod(fromDate: string, toDate: string): ResolvedPeriod {
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

export function session(
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

export function event(
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

export function snapshot(
  sessions: readonly AnalyticsReportSession[],
  events: readonly ReportEvent[],
  activeProfiles: ReadonlyMap<
    string,
    { readonly identifiedUserId: string; readonly traits: JsonObject }
  > = new Map(),
): ReportSnapshot {
  return { sessions, events, activeProfiles }
}

export function inputFor(
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
