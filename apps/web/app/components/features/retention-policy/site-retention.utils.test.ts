import { describe, expect, it } from 'vitest'
import type { RetentionPolicy, RetentionProposal } from './retention-policy.types'
import type { SiteRetentionResult, SiteRetentionState } from './site-retention.types'
import {
  isProposalShortening,
  siteRetentionDisabledReason,
  siteRetentionNotice,
  siteRetentionProvenance,
  toSiteRetentionView,
} from './site-retention.utils'
import { normalizeRetentionError, parseRetentionDraft } from './retention-policy.utils'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const twelve: RetentionPolicy = { eventMonths: 12, profileMonths: 12, replayMonths: null }

function siteResult(overrides: Partial<SiteRetentionResult> = {}): SiteRetentionResult {
  return {
    scope: 'site',
    siteId: 'site-1',
    installationDefault: twelve,
    siteOverride: null,
    effectivePolicy: twelve,
    cleanup: { pending: false, derived: none, backup: none },
    updatedAt: '2026-09-18T10:00:00Z',
    ...overrides,
  }
}

function readyState(result: SiteRetentionResult): SiteRetentionState {
  return {
    retention: { kind: 'ready', result, refreshing: false },
    draft: null,
    command: { kind: 'idle' },
    notice: null,
  }
}

describe('site-retention.utils', () => {
  it('labels provenance from the presence of a Site override', () => {
    expect(siteRetentionProvenance(null)).toBe('installation-default')
    expect(siteRetentionProvenance(twelve)).toBe('site-override')
  })

  it('detects shortening for both a replacement policy and a clear proposal', () => {
    const six: RetentionPolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    const longer: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }
    expect(isProposalShortening(twelve, { kind: 'policy', policy: six })).toBe(true)
    expect(isProposalShortening(twelve, { kind: 'policy', policy: longer })).toBe(false)
    expect(isProposalShortening(longer, { kind: 'inherit', installationDefault: six })).toBe(true)
    expect(isProposalShortening(six, { kind: 'inherit', installationDefault: longer })).toBe(false)
  })

  it('explains the disabled reason without claiming an installation comparison', () => {
    const valid = parseRetentionDraft({ eventMonths: '12', profileMonths: '12', replayMonths: '' })
    expect(
      siteRetentionDisabledReason({ stale: false, saving: true, dirty: true, validation: valid }),
    ).toBe('Saving retention settings.')
    expect(
      siteRetentionDisabledReason({ stale: true, saving: false, dirty: true, validation: valid }),
    ).toBe('Retention settings are stale. Refresh before saving.')
    expect(
      siteRetentionDisabledReason({
        stale: false,
        saving: false,
        dirty: true,
        validation: parseRetentionDraft({
          eventMonths: '12',
          profileMonths: '24',
          replayMonths: '',
        }),
      }),
    ).toBe('Fix the retention values before saving.')
    expect(
      siteRetentionDisabledReason({ stale: false, saving: false, dirty: false, validation: valid }),
    ).toBe('No changes to save.')
  })

  it('describes the committed proposal in scope-neutral copy', () => {
    expect(siteRetentionNotice({ kind: 'inherit', installationDefault: twelve })).toContain(
      'inherits the installation default',
    )
    expect(siteRetentionNotice({ kind: 'policy', policy: twelve })).toContain(
      'instead of the installation default',
    )
  })

  it('renders all three layers with a provenance badge and an inheritance empty state', () => {
    const inherited = toSiteRetentionView(readyState(siteResult()))
    expect(inherited).toMatchObject({
      kind: 'ready',
      provenance: 'installation-default',
      policy: { hasOverride: false, canClear: false, clearShortens: false, dirty: false },
    })

    const override: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }

    const overridden = toSiteRetentionView(
      readyState(siteResult({ siteOverride: override, effectivePolicy: override })),
    )

    expect(overridden).toMatchObject({
      kind: 'ready',
      provenance: 'site-override',
      policy: {
        hasOverride: true,
        canClear: true,
        siteOverride: override,
        installationDefault: twelve,
        effective: override,
      },
    })
  })

  it('flags a clear that shortens relative to the current effective policy', () => {
    const longer: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }

    const view = toSiteRetentionView(
      readyState(
        siteResult({
          installationDefault: { eventMonths: 6, profileMonths: 6, replayMonths: null },
          siteOverride: longer,
          effectivePolicy: longer,
        }),
      ),
    )

    expect(view).toMatchObject({ kind: 'ready', policy: { clearShortens: true } })
  })

  it('projects loading, access, and error states', () => {
    expect(
      toSiteRetentionView({
        retention: { kind: 'loading' },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'loading' })

    const forbidden = normalizeRetentionError({ code: 'FORBIDDEN' }, 'read', 'site')
    expect(
      toSiteRetentionView({
        retention: { kind: 'failed', error: forbidden },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'access-error', error: { kind: 'forbidden' } })

    expect(
      toSiteRetentionView({
        retention: {
          kind: 'failed',
          error: normalizeRetentionError({ code: 'NOT_FOUND' }, 'read', 'site'),
        },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'error', error: { kind: 'not-found', action: 'refresh' } })
  })

  it('keeps a dirty draft, marks staleness, and announces pending cleanup', () => {
    const state: SiteRetentionState = {
      retention: {
        kind: 'stale',
        result: siteResult({
          cleanup: {
            pending: true,
            derived: { status: 'pending', startedAt: null, completedAt: null, errorCode: null },
            backup: { status: 'not_started', startedAt: null, completedAt: null, errorCode: null },
          },
        }),
        error: normalizeRetentionError({ code: 'INTERNAL_SERVER_ERROR' }, 'read', 'site'),
        refreshing: false,
      },
      draft: { eventMonths: '18', profileMonths: '18', replayMonths: '' },
      command: { kind: 'idle' },
      notice: null,
    }

    expect(toSiteRetentionView(state)).toMatchObject({
      kind: 'ready',
      stale: true,
      policy: {
        dirty: true,
        canAttemptSubmit: false,
        canSubmit: false,
        canClear: false,
        draft: { eventMonths: '18' },
        disabledReason: 'Retention settings are stale. Refresh before saving.',
      },
      announcement: expect.stringContaining('could not be loaded'),
    })
  })

  it('surfaces the committed notice through the announcement', () => {
    const proposal: RetentionProposal = { kind: 'inherit', installationDefault: twelve }

    const view = toSiteRetentionView({
      ...readyState(siteResult()),
      notice: { kind: 'committed', message: siteRetentionNotice(proposal) },
    })

    expect(view).toMatchObject({ kind: 'ready', announcement: siteRetentionNotice(proposal) })
  })
})
