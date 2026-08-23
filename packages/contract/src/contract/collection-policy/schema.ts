import * as v from 'valibot'
import { SId, SScalarMap } from '../../schema/index.ts'

export const SPolicy = v.strictObject({
  siteId: SId,
  anonymousCollection: v.picklist(['enabled', 'disabled']),
  honorGpcDnt: v.boolean(),
  consentMode: v.picklist(['none', 'required_for_identity', 'required_for_all']),
  botPolicy: v.picklist(['exclude', 'include', 'record_excluded']),
  captureQueryStrings: v.boolean(),
  urlPolicy: v.strictObject({ capturePath: v.boolean(), captureReferrer: v.boolean() }),
  propertyPolicy: v.strictObject({
    allowScalarProperties: v.boolean(),
    maxProperties: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  }),
  exclusions: v.strictObject({ hostnames: v.array(v.string()), paths: v.array(v.string()) }),
  defaults: v.optional(SScalarMap),
})
export const PSafePolicy = v.strictObject({
  effective: SPolicy,
  source: v.picklist(['installation', 'site']),
})
export const SCollectionPolicySiteFields = v.strictObject({ siteId: SId })
export const SCollectionPolicyUpdateFields = v.strictObject({ siteId: SId, policy: SPolicy })
