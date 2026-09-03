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
    expect({
      scope: 'installation',
      policy: values,
    }).toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({
      scope: 'site',
      policy: { ...values, siteId: 'ste-1' },
    }).toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({
      policy: { ...values, siteId: 'ste-1' },
    }).not.toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
    expect({
      scope: 'site',
      policy: values,
    }).not.toEqual(expect.schemaMatching(SCollectionPolicyUpdateFields))
  })

  it('does not accept a scope-less policy', () => {
    expect(values).not.toEqual(expect.schemaMatching(SPolicy))
    expect({ scope: 'site', siteId: 'ste-1', ...values }).toEqual(expect.schemaMatching(SPolicy))
  })

  it('requires complete installation-or-Site provenance', () => {
    const output = {
      installationDefault: { scope: 'installation', ...values },
      siteOverride: { scope: 'site', siteId: 'ste-1', ...values },
      effective: { scope: 'site', siteId: 'ste-1', ...values },
      source,
    }

    expect(output).toEqual(expect.schemaMatching(PSafePolicy))
    const { consentMode: _consentMode, ...missingSource } = source
    expect({ ...output, source: missingSource }).not.toEqual(expect.schemaMatching(PSafePolicy))
    expect({ ...output, source: { ...source, default: 'installation' } }).not.toEqual(
      expect.schemaMatching(PSafePolicy),
    )
  })
})
