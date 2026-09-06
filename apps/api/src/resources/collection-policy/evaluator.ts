import type { schema } from '@cimi/contract'
import { canonicalizeHostname, createIpMatcher } from '@cimi/utils'
import type { InferOutput } from 'valibot'
import {
  clonePolicyValues,
  type PolicyResolution,
  type PolicyValues,
  validatePolicyCombination,
} from './model.ts'

export type CollectionContext = InferOutput<typeof schema.SCollectionContext>
export type ScalarValue = string | number | boolean | null

export interface AdmissionInput {
  readonly siteId: string
  readonly hostname?: string | undefined
  readonly path?: string | undefined
  readonly country?: string | undefined
  readonly ip?: string | undefined
  readonly isBot?: boolean | undefined
  readonly url?: string | undefined
  readonly referrer?: string | undefined
  readonly properties?: Readonly<Record<string, unknown>> | undefined
  readonly identifiedUserId?: string | undefined
  readonly traits?: Readonly<Record<string, unknown>> | undefined
  readonly operation?: 'event' | 'identify' | undefined
  readonly collectionContext?: CollectionContext | undefined
}

export interface SanitizedUrls {
  readonly path: string | null
  readonly referrer: string | null
}

export type AdmissionRejection =
  | 'exclusion'
  | 'gpc_dnt'
  | 'consent'
  | 'anonymous_collection'
  | 'bot'

export type NormalizedAdmissionOutcome =
  | {
      readonly kind: 'accepted'
      readonly identity: 'anonymous' | 'identified'
      readonly bot: 'included' | 'recorded_excluded'
      readonly identifiedUserId: string | null
      readonly urls: SanitizedUrls
      readonly properties: Readonly<Record<string, ScalarValue>>
    }
  | {
      readonly kind: 'rejected'
      readonly reason: AdmissionRejection
    }

export interface AdmissionDecision {
  readonly siteId: string
  readonly revision: {
    readonly id: string
    readonly version: number
    readonly target: PolicyResolution['effective']['revision']['target']
  }
  readonly values: FrozenPolicyValues
  readonly provenance: PolicyResolution['provenance']
  readonly outcome: NormalizedAdmissionOutcome
  readonly evaluatedAt: string
}

export type FrozenPolicyValues = Readonly<{
  anonymousCollection: PolicyValues['anonymousCollection']
  honorGpcDnt: PolicyValues['honorGpcDnt']
  consentMode: PolicyValues['consentMode']
  botPolicy: PolicyValues['botPolicy']
  captureQueryStrings: PolicyValues['captureQueryStrings']
  urlPolicy: Readonly<PolicyValues['urlPolicy']>
  propertyPolicy: Readonly<
    Omit<PolicyValues['propertyPolicy'], 'reservedNames'> & {
      reservedNames: readonly string[]
    }
  >
  profileFilterKeys: readonly string[]
  exclusions: Readonly<{
    hostnames: readonly string[]
    paths: readonly string[]
    countries: readonly string[]
    ipRanges: readonly string[]
  }>
}>

export function evaluateAdmission({
  resolution,
  input,
  evaluatedAt,
}: {
  readonly resolution: PolicyResolution
  readonly input: AdmissionInput
  readonly evaluatedAt: Date
}): AdmissionDecision {
  const values = resolution.effective.values
  validatePolicyCombination(values)
  const outcome = freezeOutcome(evaluateOutcome(values, input))
  return Object.freeze({
    siteId: resolution.siteId,
    revision: Object.freeze({
      id: resolution.effective.revision.id,
      version: resolution.effective.revision.version,
      target: Object.freeze({ ...resolution.effective.revision.target }),
    }),
    values: freezePolicyValues(values),
    provenance: Object.freeze({ ...resolution.provenance }),
    outcome,
    evaluatedAt: evaluatedAt.toISOString(),
  })
}

export function sanitizeUrls({
  path,
  url,
  referrer,
  policy,
}: {
  readonly path?: string | undefined
  readonly url: string | undefined
  readonly referrer: string | undefined
  readonly policy: PolicyValues
}): SanitizedUrls {
  return {
    path: sanitizeUrlValue(path ?? url, policy.urlPolicy.capturePath, policy, false),
    referrer: sanitizeUrlValue(referrer, policy.urlPolicy.captureReferrer, policy, true),
  }
}

export function sanitizeProperties(
  properties: Readonly<Record<string, unknown>> | undefined,
  policy: PolicyValues,
): Readonly<Record<string, ScalarValue>> {
  if (!policy.propertyPolicy.allowScalarProperties || properties === undefined) return {}
  const reserved = new Set(policy.propertyPolicy.reservedNames)
  const sanitized: Record<string, ScalarValue> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (Object.keys(sanitized).length >= policy.propertyPolicy.maxProperties) break
    if (key.length === 0 || key.length > 64 || reserved.has(key)) continue
    const scalar = toScalar(value)
    if (scalar === undefined) continue
    sanitized[key] =
      typeof scalar === 'string' ? scalar.slice(0, policy.propertyPolicy.maxValueLength) : scalar
  }
  return Object.freeze(sanitized)
}

function evaluateOutcome(policy: PolicyValues, input: AdmissionInput): NormalizedAdmissionOutcome {
  const path = extractPath(input.path ?? input.url)
  if (matchesExclusion(policy, input, path)) return { kind: 'rejected', reason: 'exclusion' }

  const context = input.collectionContext
  if (policy.honorGpcDnt && (context?.gpc === true || context?.dnt === true)) {
    return { kind: 'rejected', reason: 'gpc_dnt' }
  }

  const identityRequested =
    input.operation === 'identify' ||
    input.identifiedUserId !== undefined ||
    input.traits !== undefined
  if (policy.consentMode === 'required_for_all' && context?.consent !== 'granted') {
    return { kind: 'rejected', reason: 'consent' }
  }
  if (input.operation === 'identify' && context?.consent !== 'granted') {
    return { kind: 'rejected', reason: 'consent' }
  }
  if (
    policy.consentMode === 'required_for_identity' &&
    identityRequested &&
    context?.consent !== 'granted'
  ) {
    return { kind: 'rejected', reason: 'consent' }
  }
  if (policy.consentMode === 'none' && context?.consent === 'denied') {
    return { kind: 'rejected', reason: 'consent' }
  }
  const identityAllowed = identityRequested && context?.consent === 'granted'
  if (policy.anonymousCollection === 'disabled' && !identityAllowed) {
    return { kind: 'rejected', reason: 'anonymous_collection' }
  }

  if (input.isBot === true && policy.botPolicy === 'exclude') {
    return { kind: 'rejected', reason: 'bot' }
  }

  const bot = input.isBot === true && policy.botPolicy === 'record_excluded'
  const identified = identityAllowed && !bot
  return {
    kind: 'accepted',
    identity: identified ? 'identified' : 'anonymous',
    bot: bot ? 'recorded_excluded' : 'included',
    identifiedUserId: identified ? (input.identifiedUserId ?? null) : null,
    urls: sanitizeUrls({ path: input.path, url: input.url, referrer: input.referrer, policy }),
    properties: sanitizeProperties(input.properties, policy),
  }
}

function matchesExclusion(
  policy: PolicyValues,
  input: AdmissionInput,
  path: string | undefined,
): boolean {
  const hostname = input.hostname === undefined ? undefined : canonicalizeHostname(input.hostname)
  const country = input.country?.toLowerCase()
  const ip = input.ip
  return (
    (hostname !== undefined &&
      policy.exclusions.hostnames.some((value) => value.toLowerCase() === hostname)) ||
    (path !== undefined && policy.exclusions.paths.some((value) => matchesPath(path, value))) ||
    (country !== undefined &&
      policy.exclusions.countries.some((value) => value.toLowerCase() === country)) ||
    (ip !== undefined && createIpMatcher(policy.exclusions.ipRanges).matches(ip))
  )
}

function matchesPath(path: string, excluded: string): boolean {
  const normalized = excluded.endsWith('/') ? excluded.slice(0, -1) : excluded
  return path === normalized || path.startsWith(`${normalized}/`)
}

function extractPath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    return new URL(value, 'https://cimi.invalid').pathname
  } catch {
    return undefined
  }
}

function sanitizeUrlValue(
  value: string | undefined,
  capture: boolean,
  policy: PolicyValues,
  preserveOrigin: boolean,
): string | null {
  if (!capture || value === undefined) return null
  let parsed: URL
  try {
    parsed = new URL(value, 'https://cimi.invalid')
  } catch {
    return null
  }
  const query =
    policy.captureQueryStrings && !policy.urlPolicy.stripQueryStrings
      ? sanitizeQuery(parsed.searchParams, policy.urlPolicy.stripSensitiveValues)
      : ''
  const prefix = preserveOrigin && /^https?:\/\//i.test(value) ? parsed.origin : ''
  return `${prefix}${parsed.pathname || '/'}${query}`
}

function sanitizeQuery(params: URLSearchParams, stripSensitiveValues: boolean): string {
  const sanitized = new URLSearchParams()
  for (const [key, value] of params.entries()) {
    if (stripSensitiveValues && isSensitiveQueryKey(key)) continue
    sanitized.append(key, value)
  }
  const query = sanitized.toString()
  return query === '' ? '' : `?${query}`
}

function isSensitiveQueryKey(key: string): boolean {
  return /(^|_|-)(token|secret|password|passwd|auth|api[_-]?key|email)(_|-|$)/i.test(key)
}

function toScalar(value: unknown): ScalarValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return undefined
}

function freezePolicyValues(values: PolicyValues): FrozenPolicyValues {
  const cloned = clonePolicyValues(values)
  return Object.freeze({
    ...cloned,
    urlPolicy: Object.freeze({ ...cloned.urlPolicy }),
    propertyPolicy: Object.freeze({
      ...cloned.propertyPolicy,
      reservedNames: Object.freeze([...cloned.propertyPolicy.reservedNames]),
    }),
    profileFilterKeys: Object.freeze([...cloned.profileFilterKeys]),
    exclusions: Object.freeze({
      hostnames: Object.freeze([...cloned.exclusions.hostnames]),
      paths: Object.freeze([...cloned.exclusions.paths]),
      countries: Object.freeze([...cloned.exclusions.countries]),
      ipRanges: Object.freeze([...cloned.exclusions.ipRanges]),
    }),
  })
}

function freezeOutcome(outcome: NormalizedAdmissionOutcome): NormalizedAdmissionOutcome {
  if (outcome.kind === 'rejected') return Object.freeze({ ...outcome })
  return Object.freeze({
    ...outcome,
    urls: Object.freeze({ ...outcome.urls }),
    properties: Object.freeze({ ...outcome.properties }),
  })
}
