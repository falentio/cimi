import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SRetentionPolicyUpdateInput } from './command/update.ts'
import { SRetentionPolicyGetInput } from './query/get.ts'
import { SRetentionPolicyResult } from './schema.ts'

const policy = {
  eventMonths: 12,
  profileMonths: 12,
  replayMonths: null,
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
  })

  it('allows null only when clearing a Site override', () => {
    expect(
      v.parse(SRetentionPolicyUpdateInput, { scope: 'site', siteId: 'ste-1', policy: null }),
    ).toEqual({ scope: 'site', siteId: 'ste-1', policy: null })
    expect(() => v.parse(SRetentionPolicyUpdateInput, { scope: 'site', policy: null })).toThrow(
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
        updatedAt: '2026-08-23T00:00:00Z',
      }),
    ).toMatchObject({ scope: 'site', siteOverride: null })
  })
})
