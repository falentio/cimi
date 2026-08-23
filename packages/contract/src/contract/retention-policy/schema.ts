import * as v from 'valibot'
import { SId } from '../../schema/index.ts'

export const SRetentionPolicy = v.strictObject({
  eventMonths: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
  profileMonths: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
  replayMonths: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120))),
})
export const SRetentionPolicyResult = v.strictObject({
  installationDefault: SRetentionPolicy,
  siteOverride: v.nullable(SRetentionPolicy),
  effectivePolicy: SRetentionPolicy,
})
export const SRetentionPolicySiteFields = v.strictObject({ siteId: v.optional(SId) })
export const SRetentionPolicyUpdateFields = v.strictObject(
  v.entriesFromObjects([
    SRetentionPolicySiteFields,
    v.strictObject({ policy: v.nullable(SRetentionPolicy) }),
  ]),
)
