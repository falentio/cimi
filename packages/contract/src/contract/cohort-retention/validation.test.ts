import { describe, expect, it } from 'vitest'
import { SCohortCreateInput } from './command/create.ts'

const baseInput = {
  siteId: 'site-1',
  name: 'Activation',
  entryAction: { kind: 'page_view' },
  retentionAction: { kind: 'custom_event', name: 'activated' },
  identityKind: 'identified_user',
  period: 'week',
}

describe('cohort retention contract', () => {
  it('accepts distinct entry and retention actions', () => {
    expect(baseInput).toEqual(expect.schemaMatching(SCohortCreateInput))
  })

  it('rejects identical entry and retention actions', () => {
    expect({
      ...baseInput,
      retentionAction: baseInput.entryAction,
    }).not.toEqual(expect.schemaMatching(SCohortCreateInput))
  })

  it('rejects names on pageview actions', () => {
    expect({
      ...baseInput,
      entryAction: { kind: 'page_view', name: '/signup' },
    }).not.toEqual(expect.schemaMatching(SCohortCreateInput))
  })
})
