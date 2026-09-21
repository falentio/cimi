import { describe, expect, it } from 'vitest'
import { evaluateFunnel } from '../evaluator.ts'
import { event, inputFor, session, snapshot } from '../../reporting/testing/evaluator-fixture.ts'

describe('evaluateFunnel', () => {
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
})
