import { describe, expect, it } from 'vitest'
import {
  COHORT_DRAFT_PROBLEM_LABELS,
  cohortDraftFromDefinition,
  emptyCohortDraft,
  isCompleteCohortActionDraft,
  isCompleteCohortDraft,
  toCohortAction,
  toCohortDefinitionFields,
  toCohortUpdateFields,
  validateCohortDraft,
} from './cohort-draft'
import type { CohortDraft, SCohort } from './cohort-retention.types'

function definition(overrides: Partial<SCohort> = {}): SCohort {
  return {
    id: 'coh_1',
    siteId: 'ste_1',
    name: 'Trial to paid',
    entryAction: { kind: 'page_view' },
    retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
    identityKind: 'visitor',
    period: 'week',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function draft(overrides: Partial<CohortDraft> = {}): CohortDraft {
  return {
    name: 'Trial to paid',
    entryAction: { kind: 'page_view' },
    retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
    identityKind: 'visitor',
    period: 'week',
    ...overrides,
  }
}

function validate(input: {
  draft: CohortDraft
  definitions?: readonly SCohort[]
  editingId?: string
}) {
  return validateCohortDraft({
    draft: input.draft,
    definitions: input.definitions ?? [],
    editingId: input.editingId,
  })
}

describe('emptyCohortDraft', () => {
  it('starts with a page-view entry and an unnamed retention action', () => {
    expect(emptyCohortDraft()).toEqual({
      name: '',
      entryAction: { kind: 'page_view' },
      retentionAction: { kind: 'custom_event', name: '' },
      identityKind: 'visitor',
      period: 'week',
    })
  })
})

describe('cohortDraftFromDefinition', () => {
  it('copies the definition into an editable draft', () => {
    expect(cohortDraftFromDefinition(definition())).toEqual(draft())
  })

  it('widens an outbound action with no stored name to an empty string', () => {
    expect(
      cohortDraftFromDefinition(definition({ retentionAction: { kind: 'outbound' } })),
    ).toEqual(draft({ retentionAction: { kind: 'outbound', name: '' } }))
  })
})

describe('isCompleteCohortActionDraft', () => {
  it('accepts a page view and a named action', () => {
    expect(isCompleteCohortActionDraft({ kind: 'page_view' })).toBe(true)
    expect(isCompleteCohortActionDraft({ kind: 'error', name: 'boom' })).toBe(true)
  })

  it('rejects an unnamed action that needs a name', () => {
    expect(isCompleteCohortActionDraft({ kind: 'error', name: '   ' })).toBe(false)
  })
})

describe('toCohortAction', () => {
  it('widens an outbound action with no name to the contract form', () => {
    expect(toCohortAction({ kind: 'outbound', name: '' })).toEqual({ kind: 'outbound' })
    expect(toCohortAction({ kind: 'outbound', name: 'partner.example' })).toEqual({
      kind: 'outbound',
      name: 'partner.example',
    })
  })
})

describe('isCompleteCohortDraft', () => {
  it('accepts a draft the contract can carry', () => {
    expect(isCompleteCohortDraft(draft())).toBe(true)
  })

  it('rejects an invalid identity kind or period', () => {
    expect(isCompleteCohortDraft(draft({ identityKind: 'robot' }))).toBe(false)
    expect(isCompleteCohortDraft(draft({ period: 'quarter' }))).toBe(false)
  })
})

describe('validateCohortDraft', () => {
  it('accepts a complete, distinct, uniquely named draft', () => {
    expect(validate({ draft: draft() })).toEqual({ form: null, fields: new Set() })
  })

  it('rejects identical entry and retention actions', () => {
    expect(validate({ draft: draft({ retentionAction: { kind: 'page_view' } }) }).fields).toContain(
      'actions-identical',
    )
  })

  it('rejects an outbound pair that only differs by a blank name', () => {
    const problems = validate({
      draft: draft({
        entryAction: { kind: 'outbound', name: '' },
        retentionAction: { kind: 'outbound', name: '' },
      }),
    })

    expect(problems.fields).toContain('actions-identical')
  })

  it('rejects an invalid identityKind', () => {
    expect(validate({ draft: draft({ identityKind: 'robot' }) }).fields).toContain(
      'identity-kind-invalid',
    )
  })

  it('rejects an invalid period', () => {
    expect(validate({ draft: draft({ period: 'quarter' }) }).fields).toContain('period-invalid')
  })

  it('requires a name', () => {
    expect(validate({ draft: draft({ name: '  ' }) }).fields).toContain('name-required')
  })

  it('requires each action that needs a name to carry one', () => {
    expect(
      validate({ draft: draft({ retentionAction: { kind: 'error', name: '' } }) }).fields,
    ).toContain('action-name-required')
  })

  it('rejects a name another definition in the same site already owns', () => {
    expect(validate({ draft: draft(), definitions: [definition()] }).fields).toContain(
      'name-duplicated',
    )
  })

  it('allows a definition to keep its own name while editing', () => {
    expect(
      validate({ draft: draft(), definitions: [definition()], editingId: 'coh_1' }).fields,
    ).not.toContain('name-duplicated')
  })
})

describe('toCohortDefinitionFields', () => {
  it('builds the contract create input from a complete draft', () => {
    expect(toCohortDefinitionFields({ draft: draft(), siteId: 'ste_1' })).toEqual({
      siteId: 'ste_1',
      name: 'Trial to paid',
      entryAction: { kind: 'page_view' },
      retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
      identityKind: 'visitor',
      period: 'week',
    })
  })

  it('refuses an incomplete draft instead of building a partial payload', () => {
    expect(() => toCohortDefinitionFields({ draft: emptyCohortDraft(), siteId: 'ste_1' })).toThrow()
  })
})

describe('toCohortUpdateFields', () => {
  it('rebuilds every definition field for a full replace', () => {
    expect(
      toCohortUpdateFields({
        draft: draft({ period: 'month' }),
        siteId: 'ste_1',
        cohortId: 'coh_9',
      }),
    ).toEqual({
      siteId: 'ste_1',
      cohortId: 'coh_9',
      name: 'Trial to paid',
      entryAction: { kind: 'page_view' },
      retentionAction: { kind: 'custom_event', name: 'checkout_completed' },
      identityKind: 'visitor',
      period: 'month',
    })
  })
})

describe('COHORT_DRAFT_PROBLEM_LABELS', () => {
  it('labels every draft problem', () => {
    expect(Object.keys(COHORT_DRAFT_PROBLEM_LABELS).sort()).toEqual(
      [
        'action-name-required',
        'actions-identical',
        'entry-action-required',
        'identity-kind-invalid',
        'name-duplicated',
        'name-required',
        'period-invalid',
        'retention-action-required',
      ].sort(),
    )
  })

  it('states the distinct-action rule in plain words', () => {
    expect(COHORT_DRAFT_PROBLEM_LABELS['actions-identical']).toMatch(/different/i)
  })
})
