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
      {
        expected: 'eq',
        filter: { scope: 'event', field: 'name', operator: 'equals', values: ['purchase'] },
      },
      {
        expected: 'neq',
        filter: { scope: 'event', field: 'name', operator: 'not_equals', values: ['purchase'] },
      },
      {
        expected: 'contains',
        filter: { scope: 'event', field: 'name', operator: 'contains', values: ['pur'] },
      },
      {
        expected: 'gt',
        filter: { scope: 'session', field: 'country', operator: 'greater_than', values: [5] },
      },
      {
        expected: 'lt',
        filter: { scope: 'session', field: 'country', operator: 'less_than', values: [5] },
      },
    ] as const

    for (const { expected, filter } of cases) {
      const plan = expectOk(traffic([filter]))
      if (filter.scope === 'event') expect(plan.event[0]?.operator).toBe(expected)
      else expect(plan.session[0]?.operator).toBe(expected)
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

  it('allows structural null equality for a traffic Event field', () => {
    const plan = expectOk(
      traffic([{ scope: 'event', field: 'unit', operator: 'equals', values: [null] }]),
    )
    expect(plan.event[0]?.bind).toEqual([null])
  })
})

describe('compileEventFilterPlan', () => {
  it('maps an event field filter to the event group', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        eventKind: 'error',
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
        eventKind: 'page_view',
        filters: [
          {
            scope: 'event',
            field: 'property.total',
            operator: 'equals',
            values: [12, false, null],
          },
        ],
        profileFilterKeys: noTraits,
      }),
    )
    expect(plan.event).toEqual<Predicate[]>([
      { target: 'event.property', propertyKey: 'total', operator: 'eq', bind: [12, false, null] },
    ])
  })

  it('builds a presence predicate with nested property filters', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        eventKind: 'custom_event',
        filters: [
          {
            scope: 'session',
            operator: 'has_done',
            action: {
              kind: 'custom_event',
              name: 'purchase',
              propertyFilters: [
                { key: 'total', operator: 'greater_than', values: [100] },
                { key: 'active', operator: 'equals', values: [true, null] },
              ],
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
        propertyFilters: [
          { key: 'total', operator: 'gt', bind: [100] },
          { key: 'active', operator: 'eq', bind: [true, null] },
        ],
        negated: false,
      },
    ])
  })

  it('rejects contains on a property with a numeric value', () => {
    const result = compileEventFilterPlan({
      eventKind: 'page_view',
      filters: [{ scope: 'event', field: 'property.total', operator: 'contains', values: [5] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })

  it('rejects greater_than on a property with a string value', () => {
    const result = compileEventFilterPlan({
      eventKind: 'page_view',
      filters: [
        { scope: 'event', field: 'property.total', operator: 'greater_than', values: ['5'] },
      ],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })

  it('rejects an unknown event field', () => {
    const result = compileEventFilterPlan({
      eventKind: 'page_view',
      filters: [{ scope: 'event', field: 'device', operator: 'equals', values: ['mobile'] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'unsupported-field')
  })

  it('accepts explicit null equality for a nullable Event field', () => {
    const plan = expectOk(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [{ scope: 'event', field: 'referrer', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
    )
    expect(plan.event).toEqual<Predicate[]>([
      { target: 'event.referrer', propertyKey: null, operator: 'eq', bind: [null] },
    ])
  })

  it('applies Event Kind field presence and nullability', () => {
    expectFail(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
      'incompatible-value',
    )
    expectFail(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [{ scope: 'event', field: 'name', operator: 'equals', values: ['home'] }],
        profileFilterKeys: noTraits,
      }),
      'incompatible-value',
    )
    expectOk(
      compileEventFilterPlan({
        eventKind: 'custom_event',
        filters: [{ scope: 'event', field: 'pagePath', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
    )
    expectOk(
      compileEventFilterPlan({
        eventKind: 'outbound',
        filters: [{ scope: 'event', field: 'name', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
    )
    expectOk(
      compileEventFilterPlan({
        eventKind: 'performance',
        filters: [{ scope: 'event', field: 'unit', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
    )
    expectOk(
      compileEventFilterPlan({
        eventKind: 'error',
        filters: [{ scope: 'event', field: 'code', operator: 'equals', values: [null] }],
        profileFilterKeys: noTraits,
      }),
    )
  })

  it('rejects invalid direct Event operators and values', () => {
    expectFail(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [
          { scope: 'event', field: 'kind', operator: 'greater_than', values: ['page_view'] },
        ],
        profileFilterKeys: noTraits,
      }),
      'incompatible-value',
    )
    expectFail(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [{ scope: 'event', field: 'pagePath', operator: 'greater_than', values: ['42'] }],
        profileFilterKeys: noTraits,
      }),
      'incompatible-value',
    )
    expectFail(
      compileEventFilterPlan({
        eventKind: 'page_view',
        filters: [{ scope: 'event', field: 'kind', operator: 'equals', values: ['unknown'] }],
        profileFilterKeys: noTraits,
      }),
      'incompatible-value',
    )
  })

  it('rejects explicit null for event inequality', () => {
    const result = compileEventFilterPlan({
      eventKind: 'page_view',
      filters: [{ scope: 'event', field: 'referrer', operator: 'not_equals', values: [null] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })

  it('rejects contains with a null value', () => {
    const result = compileEventFilterPlan({
      eventKind: 'page_view',
      filters: [{ scope: 'event', field: 'referrer', operator: 'contains', values: [null] }],
      profileFilterKeys: noTraits,
    })
    expectFail(result, 'incompatible-value')
  })
})
