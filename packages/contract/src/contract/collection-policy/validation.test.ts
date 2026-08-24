import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { PSafePolicy, SCollectionPolicyUpdateFields, SPolicy } from './schema.ts'

const values = {
  anonymousCollection: 'enabled' as const,
  honorGpcDnt: true,
  consentMode: 'required_for_identity' as const,
  botPolicy: 'exclude' as const,
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
}

const source = {
  anonymousCollection: 'installation' as const,
  honorGpcDnt: 'installation' as const,
  consentMode: 'site' as const,
  botPolicy: 'installation' as const,
  captureQueryStrings: 'installation' as const,
  urlPolicy: 'site' as const,
  propertyPolicy: 'installation' as const,
  profileFilterKeys: 'site' as const,
  exclusions: 'installation' as const,
}

describe('collection policy schemas', () => {
  it('discriminates installation defaults from Site overrides', () => {
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'installation',
        policy: values,
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'site',
        policy: { ...values, siteId: 'site-1' },
      }).success,
    ).toBe(true)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        policy: { ...values, siteId: 'site-1' },
      }).success,
    ).toBe(false)
    expect(
      v.safeParse(SCollectionPolicyUpdateFields, {
        scope: 'site',
        policy: values,
      }).success,
    ).toBe(false)
  })

  it('does not accept a scope-less policy', () => {
    expect(v.safeParse(SPolicy, values).success).toBe(false)
    expect(v.safeParse(SPolicy, { scope: 'site', siteId: 'site-1', ...values }).success).toBe(true)
  })

  it('requires complete installation-or-Site provenance', () => {
    const output = {
      installationDefault: { scope: 'installation', ...values },
      siteOverride: { scope: 'site', siteId: 'site-1', ...values },
      effective: { scope: 'site', siteId: 'site-1', ...values },
      source,
    }

    expect(v.safeParse(PSafePolicy, output).success).toBe(true)
    const { consentMode: _consentMode, ...missingSource } = source
    expect(v.safeParse(PSafePolicy, { ...output, source: missingSource }).success).toBe(false)
    expect(
      v.safeParse(PSafePolicy, { ...output, source: { ...source, default: 'installation' } })
        .success,
    ).toBe(false)
  })
})
