import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SRetentionPolicyUpdateInput } from './command/update.ts'
import { SRetentionPolicyGetInput } from './query/get.ts'
import { SRetentionPolicy, SRetentionPolicyResult } from './schema.ts'

const policy = {
  eventMonths: 12,
  profileMonths: 12,
  replayMonths: null,
} as const
const cleanup = {
  pending: false,
  derived: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
  backup: { status: 'not_applicable', startedAt: null, completedAt: null, errorCode: null },
} as const

describe('retention policy contract', () => {
  it('requires an explicit installation scope and non-null policy', () => {
    expect(v.parse(SRetentionPolicyUpdateInput, { scope: 'installation', policy })).toEqual({
      scope: 'installation',
      policy,
    })
    expect(() =>
      v.parse(SRetentionPolicyUpdateInput, { scope: 'installation', policy: null }),
    ).toThrow(v.ValiError)
    expect(() => v.parse(SRetentionPolicyUpdateInput, { scope: 'installation' })).toThrow(
      v.ValiError,
    )
  })

  it('allows null only when clearing a Site override', () => {
    expect(
      v.parse(SRetentionPolicyUpdateInput, { scope: 'site', siteId: 'ste-1', policy: null }),
    ).toEqual({ scope: 'site', siteId: 'ste-1', policy: null })
    expect(() => v.parse(SRetentionPolicyUpdateInput, { scope: 'site', policy: null })).toThrow(
      v.ValiError,
    )
    expect(() => v.parse(SRetentionPolicyUpdateInput, { scope: 'site', siteId: 'ste-1' })).toThrow(
      v.ValiError,
    )
  })

  it('uses the same discriminator for reads and results', () => {
    expect(v.parse(SRetentionPolicyGetInput, { scope: 'installation' })).toEqual({
      scope: 'installation',
    })
    expect(() => v.parse(SRetentionPolicyGetInput, {})).toThrow(v.ValiError)
    expect(
      v.parse(SRetentionPolicyResult, {
        scope: 'site',
        siteId: 'ste-1',
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
        cleanup,
        updatedAt: '2026-08-23T00:00:00Z',
      }),
    ).toMatchObject({ scope: 'site', siteOverride: null })
  })

  it('accepts the installation result variant', () => {
    expect(
      v.parse(SRetentionPolicyResult, {
        scope: 'installation',
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
        cleanup,
        updatedAt: '2026-08-23T00:00:00Z',
      }),
    ).toMatchObject({ scope: 'installation', siteOverride: null })
  })

  it('enforces numeric bounds and integer months', () => {
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 0, profileMonths: 12, replayMonths: null }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 121, profileMonths: 12, replayMonths: null }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 12.5, profileMonths: 12, replayMonths: null }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 12, profileMonths: 0, replayMonths: null }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 12, profileMonths: 12, replayMonths: 0 }),
    ).toThrow(v.ValiError)
  })

  it('rejects unknown fields and replay boundary equality', () => {
    expect(() =>
      v.parse(SRetentionPolicy, {
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: null,
        extra: 1,
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 12, profileMonths: 12, replayMonths: 12 }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 12, profileMonths: 6, replayMonths: 6 }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicy, { eventMonths: 6, profileMonths: 12, replayMonths: null }),
    ).toThrow(v.ValiError)
  })

  it('accepts minimum, maximum, and valid equality boundaries', () => {
    expect(
      v.parse(SRetentionPolicy, { eventMonths: 1, profileMonths: 1, replayMonths: null }),
    ).toEqual({ eventMonths: 1, profileMonths: 1, replayMonths: null })
    expect(
      v.parse(SRetentionPolicy, { eventMonths: 120, profileMonths: 120, replayMonths: null }),
    ).toEqual({ eventMonths: 120, profileMonths: 120, replayMonths: null })
    expect(
      v.parse(SRetentionPolicy, { eventMonths: 24, profileMonths: 18, replayMonths: 6 }),
    ).toEqual({ eventMonths: 24, profileMonths: 18, replayMonths: 6 })
    expect(
      v.parse(SRetentionPolicy, { eventMonths: 12, profileMonths: 12, replayMonths: null }),
    ).toEqual({ eventMonths: 12, profileMonths: 12, replayMonths: null })
  })

  it('rejects malformed site reads and invalid result variants', () => {
    expect(() => v.parse(SRetentionPolicyGetInput, { scope: 'site' })).toThrow(v.ValiError)
    expect(() => v.parse(SRetentionPolicyGetInput, { scope: 'site', siteId: 123 })).toThrow(
      v.ValiError,
    )
    expect(() =>
      v.parse(SRetentionPolicyResult, {
        scope: 'installation',
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
        updatedAt: 'not-a-date',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicyResult, {
        scope: 'site',
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
        updatedAt: '2026-08-23T00:00:00Z',
      }),
    ).toThrow(v.ValiError)
    expect(() =>
      v.parse(SRetentionPolicyResult, {
        scope: 'site',
        siteId: 'ste-1',
        installationDefault: policy,
        siteOverride: null,
        effectivePolicy: policy,
        updatedAt: '2026-08-23T00:00:00Z',
        extra: 1,
      }),
    ).toThrow(v.ValiError)
  })
})
