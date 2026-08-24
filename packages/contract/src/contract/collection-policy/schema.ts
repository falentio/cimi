import * as v from 'valibot'
import { SId, SScalarKey } from '../../schema/index.ts'
export { SCollectionContext } from './transport.ts'

const SPolicyValues = {
  anonymousCollection: v.picklist(['enabled', 'disabled']),
  honorGpcDnt: v.boolean(),
  consentMode: v.picklist(['none', 'required_for_identity', 'required_for_all']),
  botPolicy: v.picklist(['exclude', 'include', 'record_excluded']),
  captureQueryStrings: v.boolean(),
  urlPolicy: v.strictObject({
    capturePath: v.boolean(),
    captureReferrer: v.boolean(),
    stripQueryStrings: v.boolean(),
    stripSensitiveValues: v.boolean(),
  }),
  propertyPolicy: v.strictObject({
    allowScalarProperties: v.boolean(),
    maxProperties: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(64)),
    maxValueLength: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(512)),
    reservedNames: v.pipe(v.array(SScalarKey), v.maxLength(64)),
  }),
  profileFilterKeys: v.pipe(v.array(SScalarKey), v.maxLength(64)),
  exclusions: v.strictObject({
    hostnames: v.pipe(v.array(v.string()), v.maxLength(128)),
    paths: v.pipe(v.array(v.string()), v.maxLength(128)),
    countries: v.pipe(v.array(v.string()), v.maxLength(128)),
    ipRanges: v.pipe(v.array(v.string()), v.maxLength(128)),
  }),
}

export const SInstallationDefaultPolicy = v.strictObject({
  scope: v.literal('installation'),
  ...SPolicyValues,
})
export const SSiteOverridePolicy = v.strictObject({
  scope: v.literal('site'),
  siteId: SId,
  ...SPolicyValues,
})
export const SPolicy = v.variant('scope', [SInstallationDefaultPolicy, SSiteOverridePolicy])

const SInstallationDefaultPolicyUpdate = v.strictObject({
  scope: v.literal('installation'),
  policy: v.strictObject(SPolicyValues),
})
const SSiteOverridePolicyUpdate = v.strictObject({
  scope: v.literal('site'),
  policy: v.strictObject({ siteId: SId, ...SPolicyValues }),
})

export const SCollectionPolicySource = v.strictObject({
  anonymousCollection: v.picklist(['installation', 'site']),
  honorGpcDnt: v.picklist(['installation', 'site']),
  consentMode: v.picklist(['installation', 'site']),
  botPolicy: v.picklist(['installation', 'site']),
  captureQueryStrings: v.picklist(['installation', 'site']),
  urlPolicy: v.picklist(['installation', 'site']),
  propertyPolicy: v.picklist(['installation', 'site']),
  profileFilterKeys: v.picklist(['installation', 'site']),
  exclusions: v.picklist(['installation', 'site']),
})

export const PSafePolicy = v.strictObject({
  installationDefault: SInstallationDefaultPolicy,
  siteOverride: v.nullable(SSiteOverridePolicy),
  effective: SSiteOverridePolicy,
  source: SCollectionPolicySource,
})
export const SCollectionPolicySiteFields = v.strictObject({ siteId: SId })
export const SCollectionPolicyUpdateFields = v.variant('scope', [
  SInstallationDefaultPolicyUpdate,
  SSiteOverridePolicyUpdate,
])
