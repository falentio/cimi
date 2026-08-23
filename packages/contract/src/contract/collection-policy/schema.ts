import * as v from 'valibot'
import { SId, SScalarKey } from '../../schema/index.ts'

export const SPolicy = v.strictObject({
  siteId: SId,
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
    maxProperties: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
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
})
export const PSafePolicy = v.strictObject({
  installationDefault: SPolicy,
  siteOverride: v.nullable(SPolicy),
  effective: SPolicy,
  source: v.record(SScalarKey, v.picklist(['installation', 'site', 'default'])),
})
export const SCollectionPolicySiteFields = v.strictObject({ siteId: SId })
export const SCollectionPolicyUpdateFields = v.pipe(
  v.strictObject({ siteId: SId, policy: SPolicy }),
  v.check(
    (input) => input.siteId === input.policy.siteId,
    'Policy Site scope must match the request.',
  ),
)
