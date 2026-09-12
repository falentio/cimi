import { describe, expect, it } from 'vitest'
import { canonicalJsonString, isRecord, sortedRecord } from '../index.ts'

describe('isRecord', () => {
  it('accepts plain objects and rejects null, arrays, and primitives', () => {
    expect(isRecord({})).toBe(true)
    expect(isRecord({ a: 1 })).toBe(true)
    expect(isRecord(null)).toBe(false)
    expect(isRecord([])).toBe(false)
    expect(isRecord('x')).toBe(false)
    expect(isRecord(42)).toBe(false)
    expect(isRecord(undefined)).toBe(false)
  })
})

describe('sortedRecord', () => {
  it('orders object keys by code unit, not locale collation', () => {
    expect(canonicalJsonString({ a: 1, B: 2 })).toBe('{"B":2,"a":1}')
  })

  it('is independent of key insertion order and nested records', () => {
    const left = canonicalJsonString({ outer: { b: 1, a: 2 }, list: [{ y: 1, x: 2 }] })
    const right = canonicalJsonString({ list: [{ x: 2, y: 1 }], outer: { a: 2, b: 1 } })
    expect(left).toBe(right)
  })

  it('preserves arrays and primitive leaves', () => {
    expect(canonicalJsonString({ list: [3, 1, 2], n: null, b: true })).toBe(
      '{"b":true,"list":[3,1,2],"n":null}',
    )
  })

  it('excludes requested keys at every nesting level', () => {
    expect(
      canonicalJsonString(
        { b: { secret: 1, a: 2 }, secret: 0 },
        { excludeKeys: new Set(['secret']) },
      ),
    ).toBe('{"b":{"a":2}}')
  })

  it('returns primitives unchanged through sortedRecord', () => {
    expect(sortedRecord(7)).toBe(7)
    expect(sortedRecord('x')).toBe('x')
    expect(sortedRecord(null)).toBe(null)
  })
})
