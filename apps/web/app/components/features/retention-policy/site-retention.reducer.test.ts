import { describe, expect, it } from 'vitest'
import type { RetentionPolicy } from './retention-policy.types'
import type { SiteRetentionResult } from './site-retention.types'
import { createInitialSiteRetentionState, reduceSiteRetention } from './site-retention.reducer'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

function result(overrides: Partial<SiteRetentionResult> = {}): SiteRetentionResult {
  const policy: RetentionPolicy = { eventMonths: 12, profileMonths: 12, replayMonths: null }

  return {
    scope: 'site',
    siteId: 'site-1',
    installationDefault: policy,
    siteOverride: null,
    effectivePolicy: policy,
    cleanup: { pending: false, derived: none, backup: none },
    updatedAt: '2026-09-18T10:00:00Z',
    ...overrides,
  }
}

describe('site-retention.reducer', () => {
  it('starts loading and adopts the first snapshot as the draft baseline', () => {
    const initial = createInitialSiteRetentionState()
    expect(initial.retention).toEqual({ kind: 'loading' })

    const next = reduceSiteRetention(initial, {
      kind: 'retention-received',
      result: result(),
    })

    expect(next.draft).toEqual({ eventMonths: '12', profileMonths: '12', replayMonths: '' })
    expect(next.retention).toMatchObject({ kind: 'ready', refreshing: false })
  })

  it('seeds the draft from the effective policy when the Site inherits', () => {
    const installation: RetentionPolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }

    const next = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-received',
      result: result({ installationDefault: installation, effectivePolicy: installation }),
    })

    expect(next.draft).toEqual({ eventMonths: '6', profileMonths: '6', replayMonths: '' })
  })

  it('preserves a dirty draft through a refresh and keeps a failed proposal explicit', () => {
    const first = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-received',
      result: result(),
    })

    const edited = reduceSiteRetention(first, {
      kind: 'field-edited',
      field: 'eventMonths',
      value: '18',
    })

    const refreshed = reduceSiteRetention(edited, {
      kind: 'retention-received',
      result: result({ updatedAt: '2026-09-18T11:00:00Z' }),
    })

    expect(refreshed.draft?.eventMonths).toBe('18')

    const proposal = {
      kind: 'inherit',
      installationDefault: { eventMonths: 6, profileMonths: 6, replayMonths: null },
    } as const

    const confirming = reduceSiteRetention(refreshed, {
      kind: 'save-requested',
      proposal,
      impact: { event: { from: 12, to: 6 }, profile: { from: 12, to: 6 }, replay: null },
    })

    expect(confirming.command).toMatchObject({
      kind: 'confirming',
      proposal,
      acknowledgement: { kind: 'required' },
      baseline: { updatedAt: '2026-09-18T11:00:00Z' },
    })

    const accepted = reduceSiteRetention(confirming, {
      kind: 'confirmation-edited',
      value: 'SHORTEN RETENTION',
    })

    expect(accepted.command).toMatchObject({ acknowledgement: { kind: 'accepted' } })

    const rejected = reduceSiteRetention(confirming, {
      kind: 'confirmation-edited',
      value: 'shorten',
    })

    expect(rejected.command).toMatchObject({
      acknowledgement: { kind: 'required', error: expect.stringContaining('SHORTEN RETENTION') },
    })
  })

  it('cancels only a pending confirmation', () => {
    const idle = createInitialSiteRetentionState()
    expect(reduceSiteRetention(idle, { kind: 'save-cancelled' })).toBe(idle)

    const confirming = reduceSiteRetention(
      reduceSiteRetention(createInitialSiteRetentionState(), {
        kind: 'retention-received',
        result: result(),
      }),
      {
        kind: 'save-requested',
        proposal: {
          kind: 'policy',
          policy: { eventMonths: 6, profileMonths: 6, replayMonths: null },
        },
        impact: { event: { from: 12, to: 6 }, profile: { from: 12, to: 6 }, replay: null },
      },
    )

    expect(reduceSiteRetention(confirming, { kind: 'save-cancelled' }).command).toEqual({
      kind: 'idle',
    })
  })

  it('keeps a failed proposal and adopts the complete server response on success', () => {
    const baseline = {
      updatedAt: '2026-09-18T10:00:00Z',
      effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
      installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    } as const

    const loaded = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-received',
      result: result(),
    })

    const proposal = {
      kind: 'policy',
      policy: { eventMonths: 18, profileMonths: 18, replayMonths: null },
    } as const

    const submitting = reduceSiteRetention(loaded, {
      kind: 'save-started',
      baseline,
      proposal,
      shortening: false,
    })

    const failed = reduceSiteRetention(submitting, {
      kind: 'save-failed',
      proposal,
      shortening: false,
      error: {
        kind: 'bad-request',
        code: 'BAD_REQUEST',
        httpStatus: 400,
        message: 'Review the retention values.',
        action: 'edit',
      },
    })

    expect(failed.command).toMatchObject({ kind: 'failed', proposal })
    expect(failed.draft).toEqual({ eventMonths: '12', profileMonths: '12', replayMonths: '' })

    const saved = result({
      siteOverride: proposal.policy,
      effectivePolicy: proposal.policy,
      updatedAt: '2026-09-18T12:00:00Z',
    })

    const adopted = reduceSiteRetention(failed, {
      kind: 'save-succeeded',
      result: saved,
      proposal,
    })

    expect(adopted.command).toEqual({ kind: 'idle' })
    expect(adopted.draft?.eventMonths).toBe('18')
    expect(adopted.notice?.message).toContain('instead of the installation default')
  })

  it('explains an inheritance restore when the clear commit succeeds', () => {
    const installation: RetentionPolicy = { eventMonths: 6, profileMonths: 6, replayMonths: null }
    const override: RetentionPolicy = { eventMonths: 24, profileMonths: 24, replayMonths: null }

    const loaded = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-received',
      result: result({
        installationDefault: installation,
        siteOverride: override,
        effectivePolicy: override,
      }),
    })

    const cleared = reduceSiteRetention(loaded, {
      kind: 'save-succeeded',
      result: result({ installationDefault: installation, effectivePolicy: installation }),
      proposal: { kind: 'inherit', installationDefault: installation },
    })

    expect(cleared.draft).toEqual({ eventMonths: '6', profileMonths: '6', replayMonths: '' })
    expect(cleared.notice?.message).toContain('inherits the installation default again')
  })

  it('marks a failed refresh as stale while keeping the previous snapshot', () => {
    const loaded = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-received',
      result: result(),
    })

    const stale = reduceSiteRetention(loaded, {
      kind: 'retention-failed',
      error: {
        kind: 'server',
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: 500,
        message: 'Retention settings could not be loaded. Refresh and try again.',
        action: 'refresh',
      },
    })

    expect(stale.retention).toMatchObject({ kind: 'stale', refreshing: false })
    expect(stale.draft?.eventMonths).toBe('12')

    const failed = reduceSiteRetention(createInitialSiteRetentionState(), {
      kind: 'retention-failed',
      error: {
        kind: 'not-found',
        code: 'NOT_FOUND',
        httpStatus: 404,
        message: 'This Site is unavailable.',
        action: 'refresh',
      },
    })

    expect(failed.retention).toMatchObject({ kind: 'failed' })
  })
})
