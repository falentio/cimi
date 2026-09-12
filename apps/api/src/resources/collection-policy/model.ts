import type { schema } from '@cimi/contract'
import { createIpMatcher } from '@cimi/utils'

export type PolicyValues = schema.PolicyValues
export type PolicyField = schema.PolicyField

export type PolicyTarget =
  | { readonly scope: 'installation' }
  | { readonly scope: 'site'; readonly siteId: string }

export interface PolicyRevision {
  readonly id: string
  readonly version: number
  readonly target: PolicyTarget
  readonly values: PolicyValues
}

export interface PolicyLayers {
  readonly installation: PolicyRevision
  readonly site: PolicyRevision | null
}

export type PolicyProvenance = Readonly<Record<PolicyField, 'installation' | 'site'>>

export interface PolicyResolution {
  readonly siteId: string
  readonly layers: PolicyLayers
  readonly installationDefault: PolicyValues
  readonly siteOverride: PolicyValues | null
  readonly effective: {
    readonly scope: 'site'
    readonly siteId: string
    readonly values: PolicyValues
    readonly revision: PolicyRevision
  }
  readonly provenance: PolicyProvenance
}

export class PolicyValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PolicyValidationError'
  }
}

export function clonePolicyValues(values: PolicyValues): PolicyValues {
  return {
    anonymousCollection: values.anonymousCollection,
    honorGpcDnt: values.honorGpcDnt,
    consentMode: values.consentMode,
    botPolicy: values.botPolicy,
    captureQueryStrings: values.captureQueryStrings,
    urlPolicy: { ...values.urlPolicy },
    propertyPolicy: {
      ...values.propertyPolicy,
      reservedNames: [...values.propertyPolicy.reservedNames],
    },
    profileFilterKeys: [...values.profileFilterKeys],
    exclusions: {
      hostnames: [...values.exclusions.hostnames],
      paths: [...values.exclusions.paths],
      countries: [...values.exclusions.countries],
      ipRanges: [...values.exclusions.ipRanges],
    },
  }
}

export function resolvePolicy({
  siteId,
  layers,
}: {
  readonly siteId: string
  readonly layers: PolicyLayers
}): PolicyResolution {
  const siteOverride = layers.site?.values ?? null
  const values = clonePolicyValues(siteOverride ?? layers.installation.values)
  const provenance: PolicyProvenance = {
    anonymousCollection: layers.site === null ? 'installation' : 'site',
    honorGpcDnt: layers.site === null ? 'installation' : 'site',
    consentMode: layers.site === null ? 'installation' : 'site',
    botPolicy: layers.site === null ? 'installation' : 'site',
    captureQueryStrings: layers.site === null ? 'installation' : 'site',
    urlPolicy: layers.site === null ? 'installation' : 'site',
    propertyPolicy: layers.site === null ? 'installation' : 'site',
    profileFilterKeys: layers.site === null ? 'installation' : 'site',
    exclusions: layers.site === null ? 'installation' : 'site',
  }
  const effectiveRevision = layers.site ?? layers.installation
  return {
    siteId,
    layers,
    installationDefault: clonePolicyValues(layers.installation.values),
    siteOverride: siteOverride === null ? null : clonePolicyValues(siteOverride),
    effective: {
      scope: 'site',
      siteId,
      values,
      revision: effectiveRevision,
    },
    provenance,
  }
}

export function validatePolicyCombination(values: PolicyValues): void {
  assertUnique('reservedNames', values.propertyPolicy.reservedNames)
  assertUnique('profileFilterKeys', values.profileFilterKeys)
  if (values.captureQueryStrings && values.urlPolicy.stripQueryStrings) {
    throw new PolicyValidationError(
      'Query strings cannot be captured while URL query strings are stripped.',
    )
  }
  try {
    createIpMatcher(values.exclusions.ipRanges)
  } catch {
    throw new PolicyValidationError('exclusions.ipRanges must contain valid IP patterns.')
  }
}

function assertUnique(name: string, values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new PolicyValidationError(`${name} must not contain duplicate values.`)
  }
}
