import type {
  CollectionPolicyEditorView,
  PolicyField,
  PolicyProvenance,
} from '../collection-policy.types'
import {
  describeEffectiveField,
  POLICY_FIELD_LABELS,
  POLICY_FIELD_META,
} from '../collection-policy.utils'

export type EffectiveRow = {
  readonly field: PolicyField
  readonly label: string
  readonly value: string
  readonly description: string
  readonly source: PolicyProvenance
}

export type EffectiveGroup = {
  readonly id: string
  readonly title: string
  readonly blurb: string
  readonly rows: readonly EffectiveRow[]
}

const GROUP_SPECS = [
  {
    id: 'collected',
    title: 'What is collected',
    blurb: 'Which requests become accepted records, and which identity signals gate them.',
    fields: ['anonymousCollection', 'honorGpcDnt', 'consentMode', 'botPolicy'],
  },
  {
    id: 'stored',
    title: 'What is stored',
    blurb: 'Which parts of an accepted request survive into the stored record.',
    fields: ['captureQueryStrings', 'urlPolicy', 'propertyPolicy', 'profileFilterKeys'],
  },
  {
    id: 'refused',
    title: 'What is refused',
    blurb:
      'Traffic here creates no accepted record, no Visitor, no Identified User, and no Session.',
    fields: ['exclusions'],
  },
] as const satisfies ReadonlyArray<{
  readonly id: string
  readonly title: string
  readonly blurb: string
  readonly fields: readonly PolicyField[]
}>

function rowFor(editor: CollectionPolicyEditorView, field: PolicyField): EffectiveRow {
  return {
    field,
    label: POLICY_FIELD_LABELS[field],
    value: describeEffectiveField(editor.effective, field),
    description: POLICY_FIELD_META.find((meta) => meta.field === field)?.description ?? '',
    source: editor.source[field],
  }
}

export function effectiveGroups(editor: CollectionPolicyEditorView): readonly EffectiveGroup[] {
  return GROUP_SPECS.map((spec) => ({
    id: spec.id,
    title: spec.title,
    blurb: spec.blurb,
    rows: spec.fields.map((field) => rowFor(editor, field)),
  }))
}

export function effectiveProvenance(editor: CollectionPolicyEditorView): string {
  const sources = new Set(Object.values(editor.source))

  if (sources.size === 1) {
    return sources.has('site')
      ? 'Every field comes from the Site override.'
      : 'No Site override is stored, so every field comes from the installation default.'
  }

  return 'Some fields come from the Site override; the rest come from the installation default.'
}
