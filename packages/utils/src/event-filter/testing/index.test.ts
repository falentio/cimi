import { describe, expect, it } from 'vitest'
import {
  EVENT_FIELD_STATES,
  EVENT_KINDS,
  isCompatibleDirectEventFilter,
  isCompatibleEventFilterForKind,
  isCompatiblePropertyFilter,
} from '../index.ts'

describe('event filter compatibility', () => {
  it('publishes the canonical Event Kind vocabulary and field states', () => {
    expect(EVENT_KINDS).toEqual(['page_view', 'custom_event', 'outbound', 'performance', 'error'])
    expect(EVENT_FIELD_STATES.page_view).toEqual({
      kind: 'required',
      name: 'absent',
      pagePath: 'required',
      referrer: 'nullable',
      destination: 'absent',
      unit: 'absent',
      code: 'absent',
    })
    expect(EVENT_FIELD_STATES.outbound.name).toBe('nullable')
    expect(EVENT_FIELD_STATES.performance.unit).toBe('nullable')
    expect(EVENT_FIELD_STATES.error.code).toBe('nullable')
  })

  it('allows only structurally compatible direct Event values', () => {
    expect(
      isCompatibleDirectEventFilter({
        field: 'name',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(true)
    expect(
      isCompatibleDirectEventFilter({
        field: 'name',
        operator: 'not_equals',
        values: [null],
      }),
    ).toBe(false)
    expect(
      isCompatibleDirectEventFilter({
        field: 'pagePath',
        operator: 'greater_than',
        values: ['42'],
      }),
    ).toBe(false)
    expect(
      isCompatibleDirectEventFilter({
        field: 'kind',
        operator: 'greater_than',
        values: ['page_view'],
      }),
    ).toBe(false)
    expect(
      isCompatibleDirectEventFilter({
        field: 'kind',
        operator: 'equals',
        values: ['page_view'],
      }),
    ).toBe(true)
    expect(
      isCompatibleDirectEventFilter({
        field: 'kind',
        operator: 'equals',
        values: ['not-an-event-kind'],
      }),
    ).toBe(false)
  })

  it('applies outer Event Kind field presence and nullability', () => {
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'page_view',
        field: 'pagePath',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(false)
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'page_view',
        field: 'name',
        operator: 'equals',
        values: ['home'],
      }),
    ).toBe(false)
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'custom_event',
        field: 'pagePath',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(true)
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'outbound',
        field: 'name',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(true)
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'performance',
        field: 'unit',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(true)
    expect(
      isCompatibleEventFilterForKind({
        eventKind: 'error',
        field: 'code',
        operator: 'equals',
        values: [null],
      }),
    ).toBe(true)
  })

  it('accepts scalar property equality and inequality values', () => {
    expect(isCompatiblePropertyFilter({ operator: 'equals', values: ['x', 1, true, null] })).toBe(
      true,
    )
    expect(isCompatiblePropertyFilter({ operator: 'not_equals', values: [null] })).toBe(true)
    expect(isCompatiblePropertyFilter({ operator: 'contains', values: ['x'] })).toBe(true)
    expect(isCompatiblePropertyFilter({ operator: 'contains', values: [1] })).toBe(false)
    expect(isCompatiblePropertyFilter({ operator: 'greater_than', values: [1] })).toBe(true)
    expect(isCompatiblePropertyFilter({ operator: 'less_than', values: ['1'] })).toBe(false)
  })
})
