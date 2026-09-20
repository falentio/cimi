import { describe, expect, it } from 'vitest'
import type { InstallationRetentionResult } from './retention-policy.types'
import { createInitialRetentionState, reduceRetention } from './retention-policy.reducer'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

function result(eventMonths: number, updatedAt: string): InstallationRetentionResult {
  return {
    scope: 'installation',
    installationDefault: { eventMonths, profileMonths: eventMonths, replayMonths: null },
    siteOverride: null,
    effectivePolicy: { eventMonths, profileMonths: eventMonths, replayMonths: null },
    cleanup: { pending: false, derived: none, backup: none },
    updatedAt,
  }
}

describe('retention-policy.reducer', () => {
  it('initializes a loading state and adopts the first server snapshot', () => {
    const initial = createInitialRetentionState()
    expect(initial.retention).toEqual({ kind: 'loading' })
    const next = reduceRetention(initial, {
      kind: 'retention-received',
      result: result(12, '2026-09-18T10:00:00Z'),
    })
    expect(next.draft).toEqual({ eventMonths: '12', profileMonths: '12', replayMonths: '' })
    expect(next.retention).toMatchObject({
      kind: 'ready',
      result: { updatedAt: '2026-09-18T10:00:00Z' },
    })
  })

  it('preserves a dirty draft through a refresh and keeps command actions explicit', () => {
    const initial = reduceRetention(createInitialRetentionState(), {
      kind: 'retention-received',
      result: result(12, '2026-09-18T10:00:00Z'),
    })
    const edited = reduceRetention(initial, {
      kind: 'field-edited',
      field: 'eventMonths',
      value: '18',
    })
    const refreshed = reduceRetention(edited, {
      kind: 'retention-received',
      result: result(9, '2026-09-18T11:00:00Z'),
    })
    expect(refreshed.draft?.eventMonths).toBe('18')

    const confirming = reduceRetention(refreshed, {
      kind: 'save-requested',
      candidate: { eventMonths: 6, profileMonths: 6, replayMonths: null },
      impact: { event: { from: 9, to: 6 }, profile: { from: 9, to: 6 }, replay: null },
    })
    expect(confirming.command).toMatchObject({
      kind: 'confirming',
      acknowledgement: { kind: 'required' },
    })
    const accepted = reduceRetention(confirming, {
      kind: 'confirmation-edited',
      value: 'SHORTEN RETENTION',
    })
    expect(accepted.command).toMatchObject({
      kind: 'confirming',
      acknowledgement: { kind: 'accepted' },
    })
  })

  it('preserves a failed candidate and adopts the complete server response on success', () => {
    const initial = reduceRetention(createInitialRetentionState(), {
      kind: 'retention-received',
      result: result(12, '2026-09-18T10:00:00Z'),
    })
    const candidate = { eventMonths: 18, profileMonths: 18, replayMonths: null } as const
    const submitting = reduceRetention(initial, {
      kind: 'save-started',
      baselineUpdatedAt: '2026-09-18T10:00:00Z',
      candidate,
      shortening: false,
    })
    const failed = reduceRetention(submitting, {
      kind: 'save-failed',
      candidate,
      shortening: false,
      error: {
        kind: 'bad-request',
        code: 'BAD_REQUEST',
        httpStatus: 400,
        message: 'Review the retention values.',
        action: 'edit',
      },
    })
    expect(failed.command).toMatchObject({ kind: 'failed', candidate })
    expect(failed.draft).toEqual({ eventMonths: '12', profileMonths: '12', replayMonths: '' })

    const saved = result(18, '2026-09-18T12:00:00Z')
    const adopted = reduceRetention(failed, { kind: 'save-succeeded', result: saved })
    expect(adopted.command).toEqual({ kind: 'idle' })
    expect(adopted.draft?.eventMonths).toBe('18')
    expect(adopted.retention).toMatchObject({
      kind: 'ready',
      result: { updatedAt: '2026-09-18T12:00:00Z' },
    })
  })
})
