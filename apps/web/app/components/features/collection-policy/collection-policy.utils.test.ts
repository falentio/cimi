import { describe, expect, it } from 'vitest'
import type {
  CollectionDraft,
  CollectionPolicyResult,
  CollectionPolicyState,
} from './collection-policy.types'
import {
  changedPolicyFields,
  collectionBaseline,
  draftFromPolicy,
  isCollectionDraftDirty,
  normalizeCollectionPolicyError,
  policyValuesFromEffective,
  summarizeCollectionPolicy,
  toCollectionPolicyView,
  toPolicyValues,
} from './collection-policy.utils'

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
  return {
    installationDefault: { ...INSTALLATION_DEFAULT },
    siteOverride: null,
    effective: { scope: 'site', siteId: 'ste_1', ...valuesOf(INSTALLATION_DEFAULT) },
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

function valuesOf(policy: CollectionPolicyResult['installationDefault']) {
  const { scope: _scope, ...values } = policy
  return values
}

const BASE_DRAFT: CollectionDraft = draftFromPolicy(policyValuesFromEffective(result().effective))

describe('collection-policy.utils', () => {
  it('round-trips every declared field without coercing omitted or explicit values', () => {
    const draft: CollectionDraft = {
      ...BASE_DRAFT,
      honorGpcDnt: false,
      profileFilterKeys: ['plan', 'seats'],
      exclusions: {
        hostnames: ['internal.example.com'],
        paths: ['/checkout'],
        countries: ['AQ'],
        ipRanges: ['10.0.0.0/8'],
      },
      propertyPolicy: { ...BASE_DRAFT.propertyPolicy, reservedNames: [] },
    }

    const parsed = toPolicyValues(draft)
    expect(parsed.kind).toBe('valid')
    if (parsed.kind !== 'valid') return

    expect(Object.keys(parsed.values).sort()).toEqual(
      [
        'anonymousCollection',
        'botPolicy',
        'captureQueryStrings',
        'consentMode',
        'exclusions',
        'honorGpcDnt',
        'profileFilterKeys',
        'propertyPolicy',
        'urlPolicy',
      ].sort(),
    )
    expect(parsed.values.honorGpcDnt).toBe(false)
    expect(parsed.values.propertyPolicy.reservedNames).toEqual([])
    expect(parsed.values.profileFilterKeys).toEqual(['plan', 'seats'])
    expect(parsed.values.exclusions.ipRanges).toEqual(['10.0.0.0/8'])
    expect(draftFromPolicy(parsed.values)).toEqual(draft)
  })

  it('keeps array order and never drops a value the user typed', () => {
    const draft = draftFromPolicy(
      policyValuesFromEffective({
        ...result().effective,
        profileFilterKeys: ['zeta', 'alpha'],
        exclusions: { hostnames: [], paths: [], countries: [], ipRanges: [] },
      }),
    )
    const parsed = toPolicyValues(draft)
    expect(parsed.kind).toBe('valid')
    if (parsed.kind !== 'valid') return
    expect(parsed.values.profileFilterKeys).toEqual(['zeta', 'alpha'])
  })

  it('treats an emptied bounded integer as a validation error instead of zero', () => {
    const draft: CollectionDraft = {
      ...BASE_DRAFT,
      propertyPolicy: { ...BASE_DRAFT.propertyPolicy, maxProperties: null },
    }
    const parsed = toPolicyValues(draft)
    expect(parsed).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'propertyPolicy.maxProperties': expect.any(String) } },
    })
    expect(JSON.stringify(parsed)).not.toContain('"maxProperties":0')
  })

  it('mirrors the server combination rules', () => {
    const duplicatedReserved: CollectionDraft = {
      ...BASE_DRAFT,
      propertyPolicy: {
        ...BASE_DRAFT.propertyPolicy,
        reservedNames: ['email', 'email'],
      },
    }
    expect(toPolicyValues(duplicatedReserved)).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'propertyPolicy.reservedNames': expect.any(String) } },
    })

    const duplicatedProfile: CollectionDraft = { ...BASE_DRAFT, profileFilterKeys: ['a', 'a'] }
    expect(toPolicyValues(duplicatedProfile)).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { profileFilterKeys: expect.any(String) } },
    })

    const conflicting: CollectionDraft = {
      ...BASE_DRAFT,
      captureQueryStrings: true,
      urlPolicy: { ...BASE_DRAFT.urlPolicy, stripQueryStrings: true },
    }
    expect(toPolicyValues(conflicting)).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { captureQueryStrings: expect.any(String) } },
    })

    const badIp: CollectionDraft = {
      ...BASE_DRAFT,
      exclusions: { ...BASE_DRAFT.exclusions, ipRanges: ['not-an-ip'] },
    }
    expect(toPolicyValues(badIp)).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'exclusions.ipRanges': expect.any(String) } },
    })
  })

  it('enforces every array cap and bound the contract declares', () => {
    const tooManyHostnames = Array.from({ length: 129 }, (_, index) => `h${index}.example.com`)
    expect(
      toPolicyValues({
        ...BASE_DRAFT,
        exclusions: { ...BASE_DRAFT.exclusions, hostnames: tooManyHostnames },
      }),
    ).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'exclusions.hostnames': expect.any(String) } },
    })

    const tooManyKeys = Array.from({ length: 65 }, (_, index) => `key${index}`)
    expect(toPolicyValues({ ...BASE_DRAFT, profileFilterKeys: tooManyKeys })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { profileFilterKeys: expect.any(String) } },
    })
    expect(
      toPolicyValues({
        ...BASE_DRAFT,
        propertyPolicy: { ...BASE_DRAFT.propertyPolicy, reservedNames: tooManyKeys },
      }),
    ).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'propertyPolicy.reservedNames': expect.any(String) } },
    })

    expect(
      toPolicyValues({
        ...BASE_DRAFT,
        propertyPolicy: { ...BASE_DRAFT.propertyPolicy, maxProperties: 65 },
      }),
    ).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'propertyPolicy.maxProperties': expect.any(String) } },
    })
    expect(
      toPolicyValues({
        ...BASE_DRAFT,
        propertyPolicy: { ...BASE_DRAFT.propertyPolicy, maxValueLength: 0 },
      }),
    ).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { 'propertyPolicy.maxValueLength': expect.any(String) } },
    })
  })

  it('detects dirty drafts and lists the changed fields with readable detail', () => {
    const baseline = collectionBaseline(result())
    expect(isCollectionDraftDirty(baseline, BASE_DRAFT)).toBe(false)

    const draft: CollectionDraft = {
      ...BASE_DRAFT,
      botPolicy: 'include',
      exclusions: { ...BASE_DRAFT.exclusions, ipRanges: ['192.168.0.0/16'] },
    }
    expect(isCollectionDraftDirty(baseline, draft)).toBe(true)
    const changes = changedPolicyFields(baseline, draft)
    expect(changes.map((change) => change.field)).toEqual(['botPolicy', 'exclusions'])
    expect(changes[0]?.label).toBe('Bot traffic')
    expect(changes[0]?.detail).toContain('Collect bot traffic')
    expect(changes[1]?.detail).toContain('IP ranges')
  })

  it('summarizes the draft stance, capture, and exclusion counts', () => {
    const summary = summarizeCollectionPolicy({
      ...BASE_DRAFT,
      consentMode: 'required_for_all',
      captureQueryStrings: true,
      urlPolicy: { ...BASE_DRAFT.urlPolicy, stripQueryStrings: false },
      exclusions: {
        hostnames: ['a.example.com'],
        paths: [],
        countries: ['AQ', 'ZZ'],
        ipRanges: ['10.0.0.0/8'],
      },
    })
    expect(summary.consentStance).toBe('Every event requires granted consent.')
    expect(summary.anonymousStance).toBe('Anonymous events are collected.')
    expect(summary.urlCapture).toContain('Query strings captured without sensitive keys')
    expect(summary.exclusions).toEqual([
      { label: 'Hostnames', count: 1 },
      { label: 'Paths', count: 0 },
      { label: 'Countries', count: 2 },
      { label: 'IP ranges', count: 1 },
    ])
  })

  it('maps transport errors to safe copy and never exposes raw details', () => {
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_REQUEST',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ]) {
      const failure = normalizeCollectionPolicyError(
        { code, status: 500, message: '/srv/private SQL secret' },
        'update',
      )
      expect(failure.code).toBe(code)
      expect(failure.message).not.toContain('/srv/private')
      expect(failure.message).not.toContain('SQL')
    }

    expect(normalizeCollectionPolicyError({ code: 'UNAUTHORIZED' }, 'read').action).toBe('sign-in')
    expect(normalizeCollectionPolicyError({ status: 403 }, 'read').action).toBe('contact-admin')
    expect(normalizeCollectionPolicyError({ code: 'BAD_REQUEST' }, 'update').action).toBe('edit')
    expect(normalizeCollectionPolicyError({ code: 'CONFLICT' }, 'update').action).toBe('refresh')
    expect(normalizeCollectionPolicyError({ code: 'INTERNAL_SERVER_ERROR' }, 'read').action).toBe(
      'refresh',
    )
  })

  it('projects loading, access, error, and ready states', () => {
    const loading: CollectionPolicyState = {
      policy: { kind: 'loading' },
      draft: null,
      editing: false,
      command: { kind: 'idle' },
      notice: null,
    }
    expect(toCollectionPolicyView(loading)).toMatchObject({ kind: 'loading' })

    const accessError = normalizeCollectionPolicyError({ code: 'FORBIDDEN' }, 'read')
    expect(
      toCollectionPolicyView({
        ...loading,
        policy: { kind: 'failed', error: accessError },
      }),
    ).toMatchObject({ kind: 'access-error', error: { kind: 'forbidden' } })

    expect(
      toCollectionPolicyView({
        ...loading,
        policy: {
          kind: 'failed',
          error: normalizeCollectionPolicyError({ code: 'NOT_FOUND' }, 'read'),
        },
      }),
    ).toMatchObject({ kind: 'error', error: { kind: 'not-found' } })

    const ready = toCollectionPolicyView({
      policy: { kind: 'ready', result: result(), refreshing: false },
      draft: null,
      editing: false,
      command: { kind: 'idle' },
      notice: null,
    })
    expect(ready).toMatchObject({
      kind: 'ready',
      stale: false,
      editor: { mode: 'view', dirty: false, hasOverride: false, canClear: false },
    })
  })

  it('reports override provenance per field when the Site has an override', () => {
    const overridden = result({
      siteOverride: {
        scope: 'site',
        siteId: 'ste_1',
        ...valuesOf(INSTALLATION_DEFAULT),
        botPolicy: 'include',
      },
      effective: {
        scope: 'site',
        siteId: 'ste_1',
        ...valuesOf(INSTALLATION_DEFAULT),
        botPolicy: 'include',
      },
      source: {
        anonymousCollection: 'site',
        honorGpcDnt: 'site',
        consentMode: 'site',
        botPolicy: 'site',
        captureQueryStrings: 'site',
        urlPolicy: 'site',
        propertyPolicy: 'site',
        profileFilterKeys: 'site',
        exclusions: 'site',
      },
    })

    const view = toCollectionPolicyView({
      policy: { kind: 'ready', result: overridden, refreshing: false },
      draft: null,
      editing: true,
      command: { kind: 'idle' },
      notice: null,
    })
    expect(view).toMatchObject({
      kind: 'ready',
      editor: { mode: 'edit', hasOverride: true, canClear: true, source: { botPolicy: 'site' } },
    })
  })
})
