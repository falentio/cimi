import { describe, expect, it } from 'vitest'

import {
  compileEventFilterPlan,
  compileTrafficFilterPlan,
  type CompileFilterResult,
  type CompileTrafficFilterInput,
} from '../query/index.ts'
import type { Predicate, PresencePredicate, ReportFilterPlan } from '../query/index.ts'

const noTraits: readonly string[] = []
const approvedTraits = ['plan', 'company'] as const

function expectOk(result: CompileFilterResult): ReportFilterPlan {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`)
  return result.plan
}

function expectFail(result: CompileFilterResult, reason: string): void {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected failure')
  expect(result.reason).toBe(reason)
}

function traffic(filters: CompileTrafficFilterInput['filters']): CompileFilterResult {
  return compileTrafficFilterPlan({ filters, profileFilterKeys: noTraits })
}

describe('compileTrafficFilterPlan', () => {
  it('maps a traffic event field filter to the event group', () => {
    const plan = expectOk(
      traffic([{ scope: 'event', field: 'pagePath', operator: 'equals', values: ['/pricing'] }]),
    )
    expect(plan.event).toEqual<Predicate[]>([
      { target: 'event.pagePath', propertyKey: null, operator: 'eq', bind: ['/pricing'] },
    ])
    expect(plan.session).toEqual([])
    expect(plan.visitor).toEqual([])
    expect(plan.sessionPresence).toEqual([])
    expect(plan.requiresProfileJoin).toBe(false)
  })

  it('maps a traffic session field filter to the session group', () => {
    const plan = expectOk(
      traffic([
        { scope: 'session', field: 'device', operator: 'not_equals', values: ['mobile', 'tablet'] },
      ]),
    )
    expect(plan.session).toEqual<Predicate[]>([
      { target: 'session.device', propertyKey: null, operator: 'neq', bind: ['mobile', 'tablet'] },
    ])
  })

  it('maps a traffic visitor field filter to the visitor group', () => {
    const plan = expectOk(
      traffic([
        {
          scope: 'visitor',
          field: 'identityKind',
          operator: 'equals',
          values: ['identified_user'],
        },
      ]),
    )
    expect(plan.visitor).toEqual<Predicate[]>([
      {
        target: 'visitor.identityKind',
        propertyKey: null,
        operator: 'eq',
        bind: ['identified_user'],
      },
    ])
  })

  it('maps every traffic operator to its predicate operator', () => {
    const cases = [
      ['equals', 'eq', 'purchase'],
      ['not_equals', 'neq', 'purchase'],
      ['contains', 'contains', 'pur'],
      ['greater_than', 'gt', 5],
      ['less_than', 'lt', 5],
    ] as const

    for (const [contractOperator, expected, value] of cases) {
      const plan = expectOk(
        traffic([{ scope: 'event', field: 'name', operator: contractOperator, values: [value] }]),
      )
      expect(plan.event[0]?.operator).toBe(expected)
    }
  })

  it('rejects an unapproved trait filter', () => {
    const result = compileTrafficFilterPlan({
      filters: [{ scope: 'profile', field: 'trait.secret', operator: 'equals', values: ['x'] }],
      profileFilterKeys: approvedTraits,
    })
    expectFail(result, 'unapproved-trait')
  })

  it('emits an approved trait filter as a profile group entry requiring a join', () => {
    const plan = expectOk(
      compileTrafficFilterPlan({
        filters: [{ scope: 'profile', field: 'trait.plan', operator: 'equals', values: ['pro'] }],
        profileFilterKeys: approvedTraits,
      }),
    )
    expect(plan.profile).toEqual<Predicate[]>([
      { target: 'profile.trait', propertyKey: 'plan', operator: 'eq', bind: ['pro'] },
    ])
    expect(plan.profileTraitKeys).toEqual(['plan'])
    expect(plan.requiresProfileJoin).toBe(true)
  })

  it('builds a presence predicate from has_done', () => {
    const plan = expectOk(
      traffic([
        {
          scope: 'visitor',
          operator: 'has_done',
          action: { kind: 'custom_event', name: 'purchase' },
        },
      ]),
    )
    expect(plan.sessionPresence).toEqual<PresencePredicate[]>([
      {
        scope: 'visitor',
        withinPeriod: false,
        action: 'custom_event',
        name: 'purchase',
        propertyFilters: [],
        negated: false,
      },
    ])
  })

  it('builds a negated presence predicate from has_not_done', () => {
    const plan = expectOk(
      traffic([{ scope: 'visitor', operator: 'has_not_done', action: { kind: 'page_view' } }]),
    )
    expect(plan.sessionPresence).toEqual<PresencePredicate[]>([
      {
        scope: 'visitor',
        withinPeriod: false,
        action: 'page_view',
        name: null,
        propertyFilters: [],
        negated: true,
      },
    ])
  })

  it('rejects an unknown traffic field', () => {
    expectFail(
      traffic([{ scope: 'event', field: 'nope', operator: 'equals', values: ['x'] }]),
      'unsupported-field',
    )
  })

  it('rejects contains with a non-string value', () => {
    expectFail(
      traffic([{ scope: 'session', field: 'city', operator: 'contains', values: [42] }]),
      'incompatible-value',
    )
  })

  it('rejects greater_than with a non-finite-number value', () => {
    expectFail(
      traffic([{ scope: 'session', field: 'country', operator: 'greater_than', values: ['x'] }]),
      'incompatible-value',
    )
  })

  it('rejects a null value for a field that cannot be null', () => {
    expectFail(
      traffic([{ scope: 'event', field: 'unit', operator: 'equals', values: [null] }]),
      'incompatible-value',
    )
  })
})

describe('compileEventFilterPlan', () => {
  it('maps an event field filter to the event group', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        filters: [{ scope: 'event', field: 'code', operator: 'equals', values: ['E1'] }],
        profileFilterKeys: noTraits,
      }),
    )
    expect(plan.event).toEqual<Predicate[]>([
      { target: 'event.code', propertyKey: null, operator: 'eq', bind: ['E1'] },
    ])
  })

  it('builds a property predicate with the extracted property key', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        filters: [{ scope: 'event', field: 'property.total', operator: 'equals', values: [12] }],
        profileFilterKeys: noTraits,
      }),
    )
    expect(plan.event).toEqual<Predicate[]>([
      { target: 'event.property', propertyKey: 'total', operator: 'eq', bind: [12] },
    ])
  })

  it('builds a presence predicate with nested property filters', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        filters: [
          {
            scope: 'session',
            operator: 'has_done',
            action: {
              kind: 'custom_event',
              name: 'purchase',
              propertyFilters: [{ key: 'total', operator: 'greater_than', values: [100] }],
            },
          },
        ],
        profileFilterKeys: noTraits,
      }),
    )
    expect(plan.sessionPresence).toEqual<PresencePredicate[]>([
      {
        scope: 'session',
        withinPeriod: true,
        action: 'custom_event',
        name: 'purchase',
        propertyFilters: [{ key: 'total', operator: 'gt', bind: [100] }],
        negated: false,
      },
    ])
  })

  it('rejects contains on a property with a numeric value', () => {
    const result = compileEventFilterPlan({
      filters: [{ scope: 'event', field: 'property.total', operator: 'contains', values: [5] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })

  it('rejects greater_than on a property with a string value', () => {
    const result = compileEventFilterPlan({
      filters: [
        { scope: 'event', field: 'property.total', operator: 'greater_than', values: ['5'] },
      ],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })

  it('rejects an unknown event field', () => {
    const result = compileEventFilterPlan({
      filters: [{ scope: 'event', field: 'device', operator: 'equals', values: ['mobile'] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'unsupported-field')
  })
})
