import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SCohortCreateInput } from './command/create.ts'

const baseInput = {
  siteId: 'site-1',
  name: 'Activation',
  entryAction: { kind: 'page_view', name: '/signup' },
  retentionAction: { kind: 'custom_event', name: 'activated' },
  identityKind: 'identified_user',
  period: 'week',
}

describe('cohort retention contract', () => {
  it('accepts distinct entry and retention actions', () => {
    expect(v.safeParse(SCohortCreateInput, baseInput).success).toBe(true)
  })

  it('rejects identical entry and retention actions', () => {
    expect(
      v.safeParse(SCohortCreateInput, {
        ...baseInput,
        retentionAction: baseInput.entryAction,
      }).success,
    ).toBe(false)
  })
})
