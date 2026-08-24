import * as v from 'valibot'
import { SDateTime, SId } from '../../schema/index.ts'

export const SRetentionPolicy = v.pipe(
  v.strictObject({
    eventMonths: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
    profileMonths: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120)),
    replayMonths: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120))),
  }),
  v.check(
    ({ eventMonths, profileMonths, replayMonths }) =>
      profileMonths <= eventMonths &&
      (replayMonths === null || (replayMonths < eventMonths && replayMonths < profileMonths)),
    'Profile retention cannot exceed Event retention, and replay retention must be shorter than both.',
  ),
)
const SInstallationRetentionPolicyResult = v.strictObject({
  scope: v.literal('installation'),
  installationDefault: SRetentionPolicy,
  siteOverride: v.nullable(SRetentionPolicy),
  effectivePolicy: SRetentionPolicy,
  updatedAt: SDateTime,
})
const SSiteRetentionPolicyResult = v.strictObject({
  scope: v.literal('site'),
  siteId: SId,
  installationDefault: SRetentionPolicy,
  siteOverride: v.nullable(SRetentionPolicy),
  effectivePolicy: SRetentionPolicy,
  updatedAt: SDateTime,
})
export const SRetentionPolicyResult = v.variant('scope', [
  SInstallationRetentionPolicyResult,
  SSiteRetentionPolicyResult,
])
export const SRetentionPolicyGetFields = v.variant('scope', [
  v.strictObject({ scope: v.literal('installation') }),
  v.strictObject({ scope: v.literal('site'), siteId: SId }),
])
export const SRetentionPolicyUpdateFields = v.variant('scope', [
  v.strictObject({ scope: v.literal('installation'), policy: SRetentionPolicy }),
  v.strictObject({ scope: v.literal('site'), siteId: SId, policy: v.nullable(SRetentionPolicy) }),
])
