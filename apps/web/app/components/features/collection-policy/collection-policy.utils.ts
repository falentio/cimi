import { parseIpPattern, SHostname } from '@cimi/utils'
import { safeParse } from 'valibot'
import type {
  CollectionDraft,
  CollectionExclusionSummary,
  CollectionFieldKey,
  CollectionPolicyChange,
  CollectionPolicyEditorView,
  CollectionPolicyFailure,
  CollectionPolicyResource,
  CollectionPolicyResult,
  CollectionPolicyState,
  CollectionPolicySummary,
  CollectionPolicyViewModel,
  CollectionValidation,
  ParsedCollectionDraft,
  PolicyField,
  PolicyValues,
  UrlPolicyValues,
} from './collection-policy.types'

const MAX_LIST_LENGTH = 128
const MAX_KEY_LIST_LENGTH = 64
const MAX_SCALAR_KEY_LENGTH = 64
const MAX_PROPERTIES = 64
const MAX_VALUE_LENGTH = 512

export const ANONYMOUS_COLLECTION_OPTIONS = [
  {
    value: 'enabled',
    label: 'Collect anonymous events',
    description: 'Events without an identified user are accepted and stored.',
  },
  {
    value: 'disabled',
    label: 'Require an identified user',
    description: 'Events without a granted identity are refused.',
  },
] as const satisfies ReadonlyArray<{
  readonly value: PolicyValues['anonymousCollection']
  readonly label: string
  readonly description: string
}>

export const CONSENT_MODE_OPTIONS = [
  {
    value: 'none',
    label: 'No consent gate',
    description: 'Consent signals are recorded but do not gate collection.',
  },
  {
    value: 'required_for_identity',
    label: 'Consent required for identity',
    description: 'Identity linking and traits need granted consent; anonymous events do not.',
  },
  {
    value: 'required_for_all',
    label: 'Consent required for everything',
    description: 'Every event needs granted consent before it is accepted.',
  },
] as const satisfies ReadonlyArray<{
  readonly value: PolicyValues['consentMode']
  readonly label: string
  readonly description: string
}>

export const BOT_POLICY_OPTIONS = [
  {
    value: 'exclude',
    label: 'Refuse bot traffic',
    description: 'Requests identified as bots create no records.',
  },
  {
    value: 'include',
    label: 'Collect bot traffic',
    description: 'Bot requests are stored like any other request.',
  },
  {
    value: 'record_excluded',
    label: 'Record bots, exclude identity',
    description: 'Bot events are stored but never linked to an identified user.',
  },
] as const satisfies ReadonlyArray<{
  readonly value: PolicyValues['botPolicy']
  readonly label: string
  readonly description: string
}>

export const POLICY_FIELD_LABELS: Record<PolicyField, string> = {
  anonymousCollection: 'Anonymous collection',
  honorGpcDnt: 'Global Privacy Control and Do Not Track',
  consentMode: 'Consent mode',
  botPolicy: 'Bot traffic',
  captureQueryStrings: 'Query string capture',
  urlPolicy: 'URL capture',
  propertyPolicy: 'Property capture',
  profileFilterKeys: 'Profile filter keys',
  exclusions: 'Exclusions',
}

export const POLICY_FIELD_META = [
  {
    field: 'anonymousCollection',
    id: 'collection-anonymous',
    description: 'Whether events without an identified user are accepted.',
  },
  {
    field: 'honorGpcDnt',
    id: 'collection-gpc-dnt',
    description: 'Whether Global Privacy Control and Do Not Track requests are refused.',
  },
  {
    field: 'consentMode',
    id: 'collection-consent',
    description: 'Which events need granted consent before they are accepted.',
  },
  {
    field: 'botPolicy',
    id: 'collection-bots',
    description: 'How traffic the server identifies as automated is treated.',
  },
  {
    field: 'captureQueryStrings',
    id: 'collection-query-strings',
    description: 'Whether query strings are kept on captured URLs.',
  },
  {
    field: 'urlPolicy',
    id: 'collection-url',
    description: 'Which parts of a URL are stored with an accepted event.',
  },
  {
    field: 'propertyPolicy',
    id: 'collection-properties',
    description: 'Which custom event properties are stored, and how large they may be.',
  },
  {
    field: 'profileFilterKeys',
    id: 'collection-profile-filter-keys',
    description: 'Approved trait keys that reporting may filter profiles by.',
  },
  {
    field: 'exclusions',
    id: 'collection-exclusions',
    description: 'Traffic matching an exclusion creates no accepted record.',
  },
] as const satisfies ReadonlyArray<{
  readonly field: PolicyField
  readonly id: string
  readonly description: string
}>

export function collectionFieldId(field: PolicyField): string {
  return POLICY_FIELD_META.find((meta) => meta.field === field)?.id ?? 'collection-anonymous'
}

export function policyFieldDescription(field: PolicyField): string {
  return POLICY_FIELD_META.find((meta) => meta.field === field)?.description ?? ''
}

export const CAPTURE_SELECT_SPECS = [
  {
    field: 'anonymousCollection',
    id: 'collection-anonymous',
    options: ANONYMOUS_COLLECTION_OPTIONS,
  },
  { field: 'consentMode', id: 'collection-consent', options: CONSENT_MODE_OPTIONS },
  { field: 'botPolicy', id: 'collection-bots', options: BOT_POLICY_OPTIONS },
] as const satisfies ReadonlyArray<{
  readonly field: 'anonymousCollection' | 'consentMode' | 'botPolicy'
  readonly id: string
  readonly options: ReadonlyArray<{
    readonly value: string
    readonly label: string
    readonly description: string
  }>
}>

export const CAPTURE_SWITCH_SPECS = [
  {
    field: 'honorGpcDnt',
    id: 'collection-gpc-dnt',
    label: POLICY_FIELD_LABELS.honorGpcDnt,
  },
  {
    field: 'captureQueryStrings',
    id: 'collection-query-strings',
    label: POLICY_FIELD_LABELS.captureQueryStrings,
  },
] as const satisfies ReadonlyArray<{
  readonly field: 'honorGpcDnt' | 'captureQueryStrings'
  readonly id: string
  readonly label: string
}>

export const URL_POLICY_SPECS = [
  {
    field: 'capturePath',
    id: 'collection-url-path',
    label: 'Capture the path',
    description: 'Store the path of an accepted event URL.',
  },
  {
    field: 'captureReferrer',
    id: 'collection-url-referrer',
    label: 'Capture the referrer',
    description: 'Store the referrer of an accepted event URL.',
  },
  {
    field: 'stripQueryStrings',
    id: 'collection-url-strip-query',
    label: 'Strip query strings',
    description: 'Remove every query string before the URL is stored.',
  },
  {
    field: 'stripSensitiveValues',
    id: 'collection-url-strip-sensitive',
    label: 'Strip sensitive query values',
    description: 'Drop token, secret, password, auth, key, and email query parameters.',
  },
] as const satisfies ReadonlyArray<{
  readonly field: keyof UrlPolicyValues
  readonly id: string
  readonly label: string
  readonly description: string
}>

export const PROPERTY_SWITCH_SPECS = [
  {
    field: 'allowScalarProperties',
    id: 'collection-property-scalars',
    label: 'Store scalar properties',
    description: 'Custom event properties are limited to text, numbers, booleans, and null values.',
  },
] as const

export function optionDescription(
  options: ReadonlyArray<{ readonly value: string; readonly description: string }>,
  value: string,
): string {
  return options.find((option) => option.value === value)?.description ?? ''
}

const SUBFIELD_IDS: Partial<Record<string, string>> = {
  'urlPolicy.capturePath': 'collection-url-path',
  'urlPolicy.captureReferrer': 'collection-url-referrer',
  'urlPolicy.stripQueryStrings': 'collection-url-strip-query',
  'urlPolicy.stripSensitiveValues': 'collection-url-strip-sensitive',
  'propertyPolicy.allowScalarProperties': 'collection-property-scalars',
  'propertyPolicy.maxProperties': 'collection-property-max',
  'propertyPolicy.maxValueLength': 'collection-property-value-length',
  'propertyPolicy.reservedNames': 'collection-property-reserved',
  'exclusions.hostnames': 'collection-exclusion-hostnames',
  'exclusions.paths': 'collection-exclusion-paths',
  'exclusions.countries': 'collection-exclusion-countries',
  'exclusions.ipRanges': 'collection-exclusion-ip-ranges',
}

export function focusTargetId(key: string): string {
  return SUBFIELD_IDS[key] ?? collectionFieldId(key as PolicyField)
}

export function fieldErrorFor(
  validation: ParsedCollectionDraft,
  key: CollectionFieldKey,
): string | null {
  if (validation.kind !== 'invalid') return null
  return validation.validation.fieldErrors[key] ?? null
}

export function describeEffectiveField(policy: PolicyValues, field: PolicyField): string {
  switch (field) {
    case 'anonymousCollection':
      return optionLabel(field, policy.anonymousCollection) ?? policy.anonymousCollection
    case 'honorGpcDnt':
      return policy.honorGpcDnt ? 'Respected' : 'Ignored'
    case 'consentMode':
      return optionLabel(field, policy.consentMode) ?? policy.consentMode
    case 'botPolicy':
      return optionLabel(field, policy.botPolicy) ?? policy.botPolicy
    case 'captureQueryStrings':
      return policy.captureQueryStrings ? 'Captured' : 'Never captured'
    case 'urlPolicy': {
      const url = policy.urlPolicy
      return [
        url.capturePath ? 'Path captured' : 'Path not captured',
        url.captureReferrer ? 'Referrer captured' : 'Referrer not captured',
        url.stripQueryStrings ? 'Query strings stripped' : 'Query strings kept',
        url.stripSensitiveValues ? 'Sensitive values stripped' : 'Sensitive values kept',
      ].join(' · ')
    }
    case 'propertyPolicy': {
      const property = policy.propertyPolicy
      if (!property.allowScalarProperties) return 'No custom properties stored'
      return [
        `At most ${property.maxProperties} properties`,
        `Values up to ${property.maxValueLength} characters`,
        property.reservedNames.length === 0
          ? 'No reserved names'
          : `${property.reservedNames.length} reserved names blocked`,
      ].join(' · ')
    }
    case 'profileFilterKeys':
      return policy.profileFilterKeys.length === 0
        ? 'None approved'
        : policy.profileFilterKeys.join(', ')
    case 'exclusions': {
      const exclusions = policy.exclusions
      return [
        `${exclusions.hostnames.length} hostnames`,
        `${exclusions.paths.length} paths`,
        `${exclusions.countries.length} countries`,
        `${exclusions.ipRanges.length} IP ranges`,
      ].join(' · ')
    }
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
}

const SUBFIELD_LABELS = {
  urlPolicy: {
    capturePath: 'Path',
    captureReferrer: 'Referrer',
    stripQueryStrings: 'Strip query strings',
    stripSensitiveValues: 'Strip sensitive values',
  },
  propertyPolicy: {
    allowScalarProperties: 'Allow scalar properties',
    maxProperties: 'Maximum properties',
    maxValueLength: 'Maximum value length',
    reservedNames: 'Reserved names',
  },
  exclusions: {
    hostnames: 'Hostnames',
    paths: 'Paths',
    countries: 'Countries',
    ipRanges: 'IP ranges',
  },
} as const

export function draftFromPolicy(policy: PolicyValues): CollectionDraft {
  return {
    anonymousCollection: policy.anonymousCollection,
    honorGpcDnt: policy.honorGpcDnt,
    consentMode: policy.consentMode,
    botPolicy: policy.botPolicy,
    captureQueryStrings: policy.captureQueryStrings,
    urlPolicy: { ...policy.urlPolicy },
    propertyPolicy: {
      allowScalarProperties: policy.propertyPolicy.allowScalarProperties,
      maxProperties: policy.propertyPolicy.maxProperties,
      maxValueLength: policy.propertyPolicy.maxValueLength,
      reservedNames: [...policy.propertyPolicy.reservedNames],
    },
    profileFilterKeys: [...policy.profileFilterKeys],
    exclusions: {
      hostnames: [...policy.exclusions.hostnames],
      paths: [...policy.exclusions.paths],
      countries: [...policy.exclusions.countries],
      ipRanges: [...policy.exclusions.ipRanges],
    },
  }
}

/**
 * The only place a draft becomes contract values. Every rule the server's
 * `validatePolicyCombination` enforces is mirrored here, and the values object
 * is built field by field so no draft key can leak into the request.
 */
export function toPolicyValues(draft: CollectionDraft): ParsedCollectionDraft {
  const fieldErrors: Partial<Record<CollectionFieldKey, string>> = {}

  const maxProperties = requireInteger(
    draft.propertyPolicy.maxProperties,
    'Maximum properties',
    0,
    MAX_PROPERTIES,
    fieldErrors,
    'propertyPolicy.maxProperties',
  )
  const maxValueLength = requireInteger(
    draft.propertyPolicy.maxValueLength,
    'Maximum value length',
    1,
    MAX_VALUE_LENGTH,
    fieldErrors,
    'propertyPolicy.maxValueLength',
  )
  const reservedNames = normalizeKeys(
    draft.propertyPolicy.reservedNames,
    'Reserved names',
    fieldErrors,
    'propertyPolicy.reservedNames',
  )
  const profileFilterKeys = normalizeKeys(
    draft.profileFilterKeys,
    'Profile filter keys',
    fieldErrors,
    'profileFilterKeys',
  )
  const hostnames = normalizeHostnames(draft.exclusions.hostnames, fieldErrors)
  const paths = normalizeList(draft.exclusions.paths, 'Paths', fieldErrors, 'exclusions.paths')
  const countries = normalizeList(
    draft.exclusions.countries,
    'Countries',
    fieldErrors,
    'exclusions.countries',
  )
  const ipRanges = normalizeIpRanges(draft.exclusions.ipRanges, fieldErrors)

  if (draft.captureQueryStrings && draft.urlPolicy.stripQueryStrings) {
    fieldErrors.captureQueryStrings =
      'Query strings cannot be captured while URL query strings are stripped.'
  }

  if (
    Object.keys(fieldErrors).length > 0 ||
    maxProperties === null ||
    maxValueLength === null ||
    reservedNames === null ||
    profileFilterKeys === null ||
    hostnames === null ||
    paths === null ||
    countries === null ||
    ipRanges === null
  ) {
    return {
      kind: 'invalid',
      validation: { fieldErrors, formError: null } satisfies CollectionValidation,
    }
  }

  return {
    kind: 'valid',
    values: {
      anonymousCollection: draft.anonymousCollection,
      honorGpcDnt: draft.honorGpcDnt,
      consentMode: draft.consentMode,
      botPolicy: draft.botPolicy,
      captureQueryStrings: draft.captureQueryStrings,
      urlPolicy: { ...draft.urlPolicy },
      propertyPolicy: {
        allowScalarProperties: draft.propertyPolicy.allowScalarProperties,
        maxProperties,
        maxValueLength,
        reservedNames,
      },
      profileFilterKeys,
      exclusions: { hostnames, paths, countries, ipRanges },
    },
  }
}

export function isCollectionDraftDirty(policy: PolicyValues, draft: CollectionDraft): boolean {
  return changedPolicyFields(policy, draft).length > 0
}

export function changedPolicyFields(
  policy: PolicyValues,
  draft: CollectionDraft,
): readonly CollectionPolicyChange[] {
  const baseline = draftFromPolicy(policy)
  const changes: CollectionPolicyChange[] = []
  for (const field of POLICY_FIELD_ORDER) {
    const detail = describeChange(field, baseline[field], draft[field])
    if (detail !== null) {
      changes.push({ field, label: POLICY_FIELD_LABELS[field], detail })
    }
  }
  return changes
}

export function summarizeCollectionPolicy(draft: CollectionDraft): CollectionPolicySummary {
  const property = draft.propertyPolicy
  const urlCapture: string[] = []
  urlCapture.push(draft.urlPolicy.capturePath ? 'Path captured' : 'Path not captured')
  urlCapture.push(draft.urlPolicy.captureReferrer ? 'Referrer captured' : 'Referrer not captured')
  if (!draft.captureQueryStrings) {
    urlCapture.push('Query strings never captured')
  } else if (draft.urlPolicy.stripQueryStrings) {
    urlCapture.push('Query string capture conflicts with stripping')
  } else {
    urlCapture.push(
      draft.urlPolicy.stripSensitiveValues
        ? 'Query strings captured without sensitive keys'
        : 'Query strings captured in full',
    )
  }

  const propertyCapture: string[] = [
    property.allowScalarProperties ? 'Scalar properties allowed' : 'Properties never stored',
  ]
  if (property.allowScalarProperties) {
    propertyCapture.push(
      property.maxProperties === null
        ? 'Property limit not set'
        : `At most ${property.maxProperties} properties per event`,
    )
    propertyCapture.push(
      property.maxValueLength === null
        ? 'Value length limit not set'
        : `Values truncated to ${property.maxValueLength} characters`,
    )
    propertyCapture.push(
      property.reservedNames.length === 0
        ? 'No reserved names'
        : `${property.reservedNames.length} reserved names blocked`,
    )
  }

  const exclusions: CollectionExclusionSummary[] = [
    { label: 'Hostnames', count: draft.exclusions.hostnames.length },
    { label: 'Paths', count: draft.exclusions.paths.length },
    { label: 'Countries', count: draft.exclusions.countries.length },
    { label: 'IP ranges', count: draft.exclusions.ipRanges.length },
  ]

  return {
    anonymousStance:
      draft.anonymousCollection === 'enabled'
        ? 'Anonymous events are collected.'
        : 'Events without an identified user are refused.',
    signalRespect: draft.honorGpcDnt
      ? 'Global Privacy Control and Do Not Track requests are refused.'
      : 'Global Privacy Control and Do Not Track signals are ignored.',
    consentStance: consentStanceLabel(draft.consentMode),
    botStance: botStanceLabel(draft.botPolicy),
    urlCapture,
    propertyCapture,
    exclusions,
  }
}

export function normalizeCollectionPolicyError(
  error: unknown,
  source: 'read' | 'update' | 'clear',
): CollectionPolicyFailure {
  const details = readErrorDetails(error)
  if (details.code === 'UNAUTHORIZED' || details.status === 401) {
    return {
      kind: 'authentication',
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      message: 'Sign in as a Site administrator to manage collection settings.',
      action: 'sign-in',
    }
  }
  if (details.code === 'FORBIDDEN' || details.status === 403) {
    return {
      kind: 'forbidden',
      code: 'FORBIDDEN',
      httpStatus: 403,
      message: 'Your account cannot manage collection settings for this Site.',
      action: 'contact-admin',
    }
  }
  if (details.code === 'NOT_FOUND' || details.status === 404) {
    return {
      kind: 'not-found',
      code: 'NOT_FOUND',
      httpStatus: 404,
      message: 'This Site is not available. Refresh or choose another Site.',
      action: 'refresh',
    }
  }
  if (details.code === 'BAD_REQUEST' || details.status === 400) {
    return {
      kind: 'bad-request',
      code: 'BAD_REQUEST',
      httpStatus: 400,
      message:
        source === 'read'
          ? 'The collection policy request was rejected. Refresh and try again.'
          : 'The collection policy was rejected. Review the combination rules and try again.',
      action: 'edit',
    }
  }
  if (details.code === 'CONFLICT' || details.status === 409) {
    return {
      kind: 'conflict',
      code: 'CONFLICT',
      httpStatus: 409,
      message: 'The Site is not active or another operation is running. Refresh before retrying.',
      action: 'refresh',
    }
  }
  if (details.code === 'INTERNAL_SERVER_ERROR' || details.status === 500) {
    return {
      kind: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      httpStatus: 500,
      message: 'Collection settings could not be completed safely. Refresh and try again.',
      action: 'refresh',
    }
  }
  return {
    kind: 'retryable',
    code: details.code,
    httpStatus: details.status,
    message:
      source === 'read'
        ? 'Collection settings could not be loaded. Refresh and try again.'
        : 'The collection policy could not be saved safely. Refresh and try again.',
    action: source === 'read' ? 'refresh' : 'retry',
  }
}

export function toCollectionPolicyView(state: CollectionPolicyState): CollectionPolicyViewModel {
  if (state.policy.kind === 'loading') {
    return { kind: 'loading', message: 'Loading the collection policy.' }
  }

  if (state.policy.kind === 'failed') {
    if (state.policy.error.kind === 'authentication' || state.policy.error.kind === 'forbidden') {
      return { kind: 'access-error', error: state.policy.error }
    }
    return { kind: 'error', error: state.policy.error }
  }

  const result = state.policy.result
  const effective = policyValuesFromEffective(result.effective)
  const baseline = collectionBaseline(result)
  const draft = state.draft ?? draftFromPolicy(baseline)
  const validation = toPolicyValues(draft)
  const stale = state.policy.kind === 'stale'
  const saving = state.command.kind === 'submitting'
  const hasOverride = result.siteOverride !== null
  const dirty = isCollectionDraftDirty(baseline, draft)
  const canAttemptSubmit = dirty && !saving && !stale
  const disabledReason = getDisabledReason({ stale, saving, validation, dirty })

  const editor: CollectionPolicyEditorView = {
    mode: state.editing ? 'edit' : 'view',
    draft,
    effective,
    baseline,
    source: result.source,
    hasOverride,
    validation,
    dirty,
    changes: changedPolicyFields(baseline, draft),
    summary: summarizeCollectionPolicy(draft),
    saving,
    operation: state.command.kind === 'submitting' ? state.command.operation : null,
    canEdit: !saving && !stale,
    canAttemptSubmit,
    canSubmit: validation.kind === 'valid' && canAttemptSubmit,
    canClear: hasOverride && !saving && !stale,
    disabledReason,
    serverError: state.command.kind === 'failed' ? state.command.error : null,
  }

  return {
    kind: 'ready',
    result,
    editor,
    command: state.command,
    notice: state.notice,
    stale,
    resourceError: state.policy.kind === 'stale' ? state.policy.error : null,
    refreshing: isRefreshing(state.policy),
    announcement: buildAnnouncement(state),
  }
}

export function policyValuesFromEffective(
  effective: Pick<CollectionPolicyResult['effective'], PolicyField>,
): PolicyValues {
  return {
    anonymousCollection: effective.anonymousCollection,
    honorGpcDnt: effective.honorGpcDnt,
    consentMode: effective.consentMode,
    botPolicy: effective.botPolicy,
    captureQueryStrings: effective.captureQueryStrings,
    urlPolicy: { ...effective.urlPolicy },
    propertyPolicy: {
      ...effective.propertyPolicy,
      reservedNames: [...effective.propertyPolicy.reservedNames],
    },
    profileFilterKeys: [...effective.profileFilterKeys],
    exclusions: {
      hostnames: [...effective.exclusions.hostnames],
      paths: [...effective.exclusions.paths],
      countries: [...effective.exclusions.countries],
      ipRanges: [...effective.exclusions.ipRanges],
    },
  }
}

/**
 * The draft always edits the values the Site currently resolves to. When a Site
 * override exists, the server's effective values already are that whole layer.
 */
export function collectionBaseline(result: CollectionPolicyResult): PolicyValues {
  return policyValuesFromEffective(result.effective)
}

const POLICY_FIELD_ORDER: readonly PolicyField[] = [
  'anonymousCollection',
  'honorGpcDnt',
  'consentMode',
  'botPolicy',
  'captureQueryStrings',
  'urlPolicy',
  'propertyPolicy',
  'profileFilterKeys',
  'exclusions',
]

function consentStanceLabel(mode: PolicyValues['consentMode']): string {
  if (mode === 'required_for_all') return 'Every event requires granted consent.'
  if (mode === 'required_for_identity') {
    return 'Identity linking requires granted consent; anonymous events do not.'
  }
  return 'Consent signals do not gate collection.'
}

function botStanceLabel(policy: PolicyValues['botPolicy']): string {
  if (policy === 'exclude') return 'Bot requests are refused.'
  if (policy === 'include') return 'Bot requests are collected like other traffic.'
  return 'Bot requests are recorded without identity.'
}

function requireInteger(
  value: number | null,
  label: string,
  min: number,
  max: number,
  errors: Partial<Record<CollectionFieldKey, string>>,
  key: CollectionFieldKey,
): number | null {
  if (value === null) {
    errors[key] = `${label} is required.`
    return null
  }
  if (!Number.isInteger(value) || value < min || value > max) {
    errors[key] = `${label} must be a whole number from ${min} to ${max}.`
    return null
  }
  return value
}

function normalizeKeys(
  values: readonly string[],
  label: string,
  errors: Partial<Record<CollectionFieldKey, string>>,
  key: CollectionFieldKey,
): string[] | null {
  if (values.length > MAX_KEY_LIST_LENGTH) {
    errors[key] = `${label} must contain at most ${MAX_KEY_LIST_LENGTH} entries.`
    return null
  }
  const normalized: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed.length > MAX_SCALAR_KEY_LENGTH) {
      errors[key] = `${label} entries must be 1 to ${MAX_SCALAR_KEY_LENGTH} characters.`
      return null
    }
    normalized.push(trimmed)
  }
  if (new Set(normalized).size !== normalized.length) {
    errors[key] = `${label} must not contain duplicate values.`
    return null
  }
  return normalized
}

function normalizeHostnames(
  values: readonly string[],
  errors: Partial<Record<CollectionFieldKey, string>>,
): string[] | null {
  if (values.length > MAX_LIST_LENGTH) {
    errors['exclusions.hostnames'] = `Hostnames must contain at most ${MAX_LIST_LENGTH} entries.`
    return null
  }
  const normalized: string[] = []
  for (const value of values) {
    const parsed = safeParse(SHostname, value.trim())
    if (!parsed.success) {
      errors['exclusions.hostnames'] = `"${value.trim()}" is not a valid hostname.`
      return null
    }
    normalized.push(parsed.output)
  }
  return normalized
}

function normalizeList(
  values: readonly string[],
  label: string,
  errors: Partial<Record<CollectionFieldKey, string>>,
  key: CollectionFieldKey,
): string[] | null {
  if (values.length > MAX_LIST_LENGTH) {
    errors[key] = `${label} must contain at most ${MAX_LIST_LENGTH} entries.`
    return null
  }
  const normalized: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      errors[key] = `${label} entries must not be empty.`
      return null
    }
    normalized.push(trimmed)
  }
  return normalized
}

function normalizeIpRanges(
  values: readonly string[],
  errors: Partial<Record<CollectionFieldKey, string>>,
): string[] | null {
  if (values.length > MAX_LIST_LENGTH) {
    errors['exclusions.ipRanges'] = `IP ranges must contain at most ${MAX_LIST_LENGTH} entries.`
    return null
  }
  const normalized: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (parseIpPattern(trimmed) === null) {
      errors['exclusions.ipRanges'] =
        `"${trimmed}" is not a valid IP address, range, or CIDR block.`
      return null
    }
    normalized.push(trimmed)
  }
  return normalized
}

function describeChange(field: PolicyField, from: unknown, to: unknown): string | null {
  if (field === 'urlPolicy' || field === 'propertyPolicy' || field === 'exclusions') {
    return describeObjectChange(field, from, to)
  }
  if (sameValue(from, to)) return null
  return `${describeValue(field, from)} → ${describeValue(field, to)}`
}

function describeObjectChange(
  field: 'urlPolicy' | 'propertyPolicy' | 'exclusions',
  from: unknown,
  to: unknown,
): string | null {
  if (!isRecord(from) || !isRecord(to)) return null
  const labels = SUBFIELD_LABELS[field]
  const parts: string[] = []
  for (const [key, label] of Object.entries(labels)) {
    const before = from[key]
    const after = to[key]
    if (sameValue(before, after)) continue
    parts.push(`${label}: ${describeValue(field, before)} → ${describeValue(field, after)}`)
  }
  return parts.length === 0 ? null : parts.join('; ')
}

function describeValue(field: PolicyField, value: unknown): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `${value.length} entries`
  if (typeof value === 'string') return optionLabel(field, value) ?? value
  return 'Unknown'
}

function optionLabel(field: PolicyField, value: string): string | null {
  if (field === 'anonymousCollection') {
    return ANONYMOUS_COLLECTION_OPTIONS.find((option) => option.value === value)?.label ?? null
  }
  if (field === 'consentMode') {
    return CONSENT_MODE_OPTIONS.find((option) => option.value === value)?.label ?? null
  }
  if (field === 'botPolicy') {
    return BOT_POLICY_OPTIONS.find((option) => option.value === value)?.label ?? null
  }
  return null
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function getDisabledReason(input: {
  readonly stale: boolean
  readonly saving: boolean
  readonly validation: ParsedCollectionDraft
  readonly dirty: boolean
}): string | null {
  if (input.saving) return 'Saving the Site override.'
  if (input.stale) return 'The loaded policy is stale. Refresh before saving.'
  if (!input.dirty) return null
  if (input.validation.kind === 'invalid') return 'Fix the highlighted values before saving.'
  return null
}

function isRefreshing(resource: CollectionPolicyResource): boolean {
  return resource.kind === 'ready' || resource.kind === 'stale' ? resource.refreshing : false
}

function buildAnnouncement(state: CollectionPolicyState): string {
  if (state.notice !== null) return state.notice.message
  if (state.command.kind === 'submitting') return 'Saving the Site override.'
  if (state.policy.kind === 'stale') return state.policy.error.message
  return ''
}

function readErrorDetails(error: unknown): {
  readonly code: string | undefined
  readonly status: number | undefined
} {
  const candidates: unknown[] = [error]
  if (isRecord(error)) candidates.push(error.data, error.error, error.cause, error.response)

  let code: string | undefined
  let status: number | undefined
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue
    if (code === undefined && typeof candidate.code === 'string') code = candidate.code
    if (status === undefined && typeof candidate.status === 'number') status = candidate.status
    if (status === undefined && typeof candidate.statusCode === 'number')
      status = candidate.statusCode
  }
  return { code, status }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
