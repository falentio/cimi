import { describe, expect, it } from 'vitest'
import { evaluateGoal } from '../evaluator.ts'
import { event, inputFor, session, snapshot } from '../../reporting/testing/evaluator-fixture.ts'

describe('evaluateGoal', () => {
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
})
