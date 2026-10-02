import { describe, expect, it } from 'vitest'
import type { CollectionPolicyResult } from './collection-policy.types'
import {
  createInitialCollectionPolicyState,
  reduceCollectionPolicy,
} from './collection-policy.reducer'
import { policyValuesFromEffective } from './collection-policy.utils'

const INSTALLATION_DEFAULT = {
  scope: 'installation',
  anonymousCollection: 'enabled',
  honorGpcDnt: true,
  consentMode: 'required_for_identity',
  botPolicy: 'exclude',
  captureQueryStrings: false,
  urlPolicy: {
    capturePath: true,
    captureReferrer: true,
    stripQueryStrings: true,
    stripSensitiveValues: true,
  },
  propertyPolicy: {
    allowScalarProperties: true,
    maxProperties: 64,
    maxValueLength: 512,
    reservedNames: [],
  },
  profileFilterKeys: [],
  exclusions: { hostnames: [], paths: [], countries: [], ipRanges: [] },
} as const satisfies CollectionPolicyResult['installationDefault']

function result(overrides: Partial<CollectionPolicyResult> = {}): CollectionPolicyResult {
  const { scope: _scope, ...values } = INSTALLATION_DEFAULT
  return {
    installationDefault: { ...INSTALLATION_DEFAULT },
    siteOverride: null,
    effective: { scope: 'site', siteId: 'ste_1', ...values },
    source: {
      anonymousCollection: 'installation',
      honorGpcDnt: 'installation',
      consentMode: 'installation',
      botPolicy: 'installation',
      captureQueryStrings: 'installation',
      urlPolicy: 'installation',
      propertyPolicy: 'installation',
      profileFilterKeys: 'installation',
      exclusions: 'installation',
    },
    ...overrides,
  }
}

describe('collection-policy.reducer', () => {
  it('initializes a loading state and adopts the first server snapshot', () => {
    const initial = createInitialCollectionPolicyState()
    expect(initial.policy).toEqual({ kind: 'loading' })
    expect(initial.draft).toBeNull()

    const next = reduceCollectionPolicy(initial, {
      kind: 'policy-received',
      result: result(),
    })
    expect(next.policy).toMatchObject({ kind: 'ready', refreshing: false })
    expect(next.draft?.propertyPolicy.maxProperties).toBe(64)
    expect(next.draft?.exclusions.ipRanges).toEqual([])
  })

  it('keeps a dirty draft through a refresh and resets it after a clean refresh', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const edited = reduceCollectionPolicy(loaded, {
      kind: 'field-edited',
      patch: { field: 'botPolicy', value: 'include' },
    })
    const refreshed = reduceCollectionPolicy(edited, {
      kind: 'policy-received',
      result: result(),
    })
    expect(refreshed.draft?.botPolicy).toBe('include')

    const cancelled = reduceCollectionPolicy(refreshed, { kind: 'edit-cancelled' })
    expect(cancelled.draft?.botPolicy).toBe('exclude')
    expect(cancelled.editing).toBe(false)
  })

  it('applies one patch without touching the other eight fields', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const edited = reduceCollectionPolicy(loaded, {
      kind: 'field-edited',
      patch: {
        field: 'exclusions',
        value: {
          hostnames: ['internal.example.com'],
          paths: [],
          countries: [],
          ipRanges: [],
        },
      },
    })
    expect(edited.draft?.exclusions.hostnames).toEqual(['internal.example.com'])
    expect(edited.draft?.propertyPolicy).toEqual(loaded.draft?.propertyPolicy)
    expect(edited.draft?.urlPolicy).toEqual(loaded.draft?.urlPolicy)
  })

  it('adopts the returned layer after a save and marks every field as Site-owned', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const started = reduceCollectionPolicy(loaded, {
      kind: 'submit-started',
      operation: 'save',
    })
    expect(started.command).toEqual({ kind: 'submitting', operation: 'save' })

    const layer = {
      ...policyValuesFromEffective(result().effective),
      botPolicy: 'include',
    } as const
    const saved = reduceCollectionPolicy(started, {
      kind: 'submit-succeeded',
      operation: 'save',
      layer,
    })

    expect(saved.command).toEqual({ kind: 'idle' })
    expect(saved.editing).toBe(false)
    expect(saved.notice).toMatchObject({ kind: 'committed', warning: null })
    if (saved.policy.kind !== 'ready') throw new Error('expected a ready policy')
    expect(saved.policy.result.source.botPolicy).toBe('site')
    expect(saved.policy.result.siteOverride).not.toBeNull()
    expect(saved.draft?.botPolicy).toBe('include')
  })

  it('clears the override to installation provenance and restores inheritance', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result({
        siteOverride: {
          scope: 'site',
          siteId: 'ste_1',
          ...policyValuesFromEffective(result().effective),
          botPolicy: 'include',
        },
        effective: {
          scope: 'site',
          siteId: 'ste_1',
          ...policyValuesFromEffective(result().effective),
          botPolicy: 'include',
        },
      }),
    })
    const cleared = reduceCollectionPolicy(loaded, {
      kind: 'submit-succeeded',
      operation: 'clear',
      layer: policyValuesFromEffective(result().effective),
    })

    expect(cleared.notice).toMatchObject({ kind: 'cleared' })
    if (cleared.policy.kind !== 'ready') throw new Error('expected a ready policy')
    expect(cleared.policy.result.siteOverride).toBeNull()
    expect(cleared.policy.result.source.botPolicy).toBe('installation')
    expect(cleared.draft?.botPolicy).toBe('exclude')
  })

  it('preserves the draft and the edit mode after a rejected write', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const editing = reduceCollectionPolicy(loaded, { kind: 'edit-begun' })
    const edited = reduceCollectionPolicy(editing, {
      kind: 'field-edited',
      patch: { field: 'captureQueryStrings', value: true },
    })
    const failed = reduceCollectionPolicy(edited, {
      kind: 'submit-failed',
      operation: 'save',
      error: {
        kind: 'bad-request',
        code: 'BAD_REQUEST',
        httpStatus: 400,
        message: 'The collection policy was rejected.',
        action: 'edit',
      },
    })

    expect(failed.command).toMatchObject({ kind: 'failed', operation: 'save' })
    expect(failed.draft?.captureQueryStrings).toBe(true)
    expect(failed.editing).toBe(true)
  })

  it('clears a failed command after a successful refresh but keeps the draft', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const edited = reduceCollectionPolicy(loaded, {
      kind: 'field-edited',
      patch: { field: 'botPolicy', value: 'record_excluded' },
    })
    const failed = reduceCollectionPolicy(edited, {
      kind: 'submit-failed',
      operation: 'clear',
      error: {
        kind: 'conflict',
        code: 'CONFLICT',
        httpStatus: 409,
        message: 'The Site is not active.',
        action: 'refresh',
      },
    })
    const refreshed = reduceCollectionPolicy(failed, {
      kind: 'policy-received',
      result: result(),
    })

    expect(refreshed.command).toEqual({ kind: 'idle' })
    expect(refreshed.draft?.botPolicy).toBe('record_excluded')
  })

  it('keeps the saved layer and attaches a warning when the follow-up refresh fails', () => {
    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const saved = reduceCollectionPolicy(loaded, {
      kind: 'submit-succeeded',
      operation: 'save',
      layer: policyValuesFromEffective(result().effective),
    })
    const warned = reduceCollectionPolicy(saved, {
      kind: 'refresh-warning',
      error: {
        kind: 'server',
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: 500,
        message: 'Collection settings could not be completed safely.',
        action: 'refresh',
      },
    })

    expect(warned.notice).toMatchObject({ kind: 'committed', warning: { kind: 'server' } })
    expect(warned.policy).toMatchObject({ kind: 'ready', refreshing: false })
    if (warned.policy.kind !== 'ready') throw new Error('expected a ready policy')
    expect(warned.policy.result.source.botPolicy).toBe('site')
  })

  it('turns a failed first read into a failure and a failed refresh into stale data', () => {
    const failure = {
      kind: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      message: 'Collection settings could not be completed safely.',
      action: 'refresh',
    } as const

    const failed = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-failed',
      error: failure,
    })
    expect(failed.policy).toEqual({ kind: 'failed', error: failure })

    const loaded = reduceCollectionPolicy(createInitialCollectionPolicyState(), {
      kind: 'policy-received',
      result: result(),
    })
    const stale = reduceCollectionPolicy(loaded, { kind: 'policy-failed', error: failure })
    expect(stale.policy).toMatchObject({ kind: 'stale', refreshing: false, error: failure })
  })
})
