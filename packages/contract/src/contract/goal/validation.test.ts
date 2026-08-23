import * as v from 'valibot'
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
    expect(v.safeParse(SGoalCreateInput, createInput).success).toBe(true)
    expect(v.safeParse(SGoalUpdateInput, { ...createInput, goalId: 'goal-1' }).success).toBe(true)
  })

  it('keeps composed inputs strict', () => {
    expect(v.safeParse(SGoalCreateInput, { ...createInput, unexpected: true }).success).toBe(false)
  })
})
