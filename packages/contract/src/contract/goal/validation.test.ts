import { describe, expect, it } from 'vitest'
import { SGoalCreateInput } from './command/create.ts'
import { SGoalUpdateInput } from './command/update.ts'

const createInput = {
  siteId: 'site-1',
  name: 'Checkout completed',
  action: { kind: 'page_view' },
  propertyFilters: [],
  identityKind: 'visitor',
}

describe('goal procedure schemas', () => {
  it('derives create and update inputs from shared fields', () => {
    expect(createInput).toEqual(expect.schemaMatching(SGoalCreateInput))
    expect({ ...createInput, goalId: 'goal-1' }).toEqual(expect.schemaMatching(SGoalUpdateInput))
  })

  it('keeps composed inputs strict', () => {
    expect({ ...createInput, unexpected: true }).not.toEqual(
      expect.schemaMatching(SGoalCreateInput),
    )
  })

  it('rejects a name on a pageview action', () => {
    expect({
      ...createInput,
      action: { kind: 'page_view', name: '/checkout' },
    }).not.toEqual(expect.schemaMatching(SGoalCreateInput))
  })
})
