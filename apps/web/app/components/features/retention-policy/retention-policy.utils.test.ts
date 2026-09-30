import { describe, expect, it } from 'vitest'
import type {
  Installation,
  InstallationRetentionResult,
  RetentionDraft,
  RetentionResource,
} from './retention-policy.types'
import {
  deriveRetentionLock,
  draftFromPolicy,
  formatRetentionDate,
  isRetentionDirty,
  isRetentionShortening,
  normalizeRetentionError,
  parseRetentionDraft,
  toRetentionAdminView,
  toRetentionCleanupProjection,
} from './retention-policy.utils'

const none = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const installation = {
  status: 'ready',
  defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  dataDirectoryReady: true,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: none,
  backupCleanup: none,
  updatedAt: '2026-09-18T10:00:00Z',
} satisfies Installation

const result = {
  scope: 'installation',
  installationDefault: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  siteOverride: null,
  effectivePolicy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  cleanup: { pending: false, derived: none, backup: none },
  updatedAt: '2026-09-18T10:00:00Z',
} satisfies InstallationRetentionResult

const draft: RetentionDraft = {
  eventMonths: '12',
  profileMonths: '12',
  replayMonths: '',
}

describe('retention-policy.utils', () => {
  it('parses string drafts and treats blank replay as null', () => {
    expect(parseRetentionDraft(draft)).toEqual({
      kind: 'valid',
      policy: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    })
    expect(draftFromPolicy(result.installationDefault)).toEqual(draft)
  })

  it('reports bounds, integer, and ordering errors without producing a policy', () => {
    expect(parseRetentionDraft({ ...draft, eventMonths: '0' })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { eventMonths: expect.any(String) } },
    })
    expect(parseRetentionDraft({ ...draft, eventMonths: '121' })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { eventMonths: expect.any(String) } },
    })
    expect(parseRetentionDraft({ ...draft, eventMonths: '12.5' })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { eventMonths: expect.any(String) } },
    })
    expect(parseRetentionDraft({ ...draft, profileMonths: '13' })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { profileMonths: expect.any(String) } },
    })
    expect(parseRetentionDraft({ ...draft, replayMonths: '12' })).toMatchObject({
      kind: 'invalid',
      validation: { fieldErrors: { replayMonths: expect.any(String) } },
    })
  })

  it('detects dirty drafts and every shortening direction', () => {
    expect(isRetentionDirty(result.installationDefault, draft)).toBe(false)
    expect(isRetentionDirty(result.installationDefault, { ...draft, eventMonths: '18' })).toBe(true)
    expect(
      isRetentionShortening(result.installationDefault, {
        eventMonths: 6,
        profileMonths: 6,
        replayMonths: null,
      }),
    ).toBe(true)
    expect(
      isRetentionShortening(result.installationDefault, {
        eventMonths: 12,
        profileMonths: 12,
        replayMonths: 6,
      }),
    ).toBe(false)
    expect(
      isRetentionShortening(
        { eventMonths: 12, profileMonths: 12, replayMonths: 6 },
        { eventMonths: 12, profileMonths: 12, replayMonths: null },
      ),
    ).toBe(true)
    expect(
      isRetentionShortening(
        { eventMonths: 12, profileMonths: 12, replayMonths: null },
        { eventMonths: 18, profileMonths: 18, replayMonths: 6 },
      ),
    ).toBe(false)
  })

  it('projects cleanup in contract order with safe labels and errors', () => {
    const cleanup = {
      pending: true,
      derived: {
        status: 'completed',
        startedAt: '2026-09-18T10:01:00Z',
        completedAt: '2026-09-18T10:02:00Z',
        errorCode: null,
      },
      backup: {
        status: 'failed',
        startedAt: '2026-09-18T10:02:00Z',
        completedAt: '2026-09-18T10:03:00Z',
        errorCode: 'CLEANUP_FAILED',
      },
    } satisfies InstallationRetentionResult['cleanup']

    const projection = toRetentionCleanupProjection(cleanup)
    expect(projection.pending).toBe(true)
    expect(projection.stages.map((stage) => stage.kind)).toEqual(['derived', 'backup'])
    expect(projection.stages.map((stage) => stage.statusLabel)).toEqual(['Completed', 'Failed'])
    expect(projection.stages[1].blockedByDerivedCleanup).toBe(false)
    expect(projection.stages[1].errorMessage).toBe(
      'Historical backup cleanup failed. Review backup and restore status.',
    )
    expect(formatRetentionDate('2026-09-18T10:00:00Z')).toContain('2026')
  })

  it('blocks writes for every unknown or unsafe installation status', () => {
    expect(deriveRetentionLock({ kind: 'loading' })).toEqual({ kind: 'loading' })
    expect(
      deriveRetentionLock({ kind: 'failed', error: normalizeRetentionError({}, 'status') }),
    ).toMatchObject({ kind: 'unknown' })
    expect(
      deriveRetentionLock({
        kind: 'stale',
        installation,
        error: normalizeRetentionError({}, 'status'),
        refreshing: false,
      }),
    ).toMatchObject({ kind: 'unknown' })
    expect(
      deriveRetentionLock({
        kind: 'ready',
        installation: { ...installation, cleanupPending: true },
        refreshing: false,
      }),
    ).toMatchObject({ kind: 'cleanup-pending' })
    expect(
      deriveRetentionLock({
        kind: 'ready',
        installation: { ...installation, status: 'maintenance' },
        refreshing: false,
      }),
    ).toMatchObject({ kind: 'not-ready' })
    expect(deriveRetentionLock({ kind: 'ready', installation, refreshing: true })).toEqual({
      kind: 'loading',
    })
    expect(deriveRetentionLock({ kind: 'ready', installation, refreshing: false })).toEqual({
      kind: 'available',
    })
  })

  it('maps transport errors to safe copy and never exposes raw details', () => {
    for (const code of [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'BAD_REQUEST',
      'CONFLICT',
      'INTERNAL_SERVER_ERROR',
    ]) {
      const failure = normalizeRetentionError(
        { code, status: 500, message: '/srv/private SQL secret' },
        'read',
      )
      expect(failure.code).toBe(code)
      expect(failure.message).not.toContain('/srv/private')
      expect(failure.message).not.toContain('SQL')
    }
  })

  it('projects loading, access, uninitialized, stale, and ready states', () => {
    expect(
      toRetentionAdminView({
        retention: { kind: 'loading' },
        installation: { kind: 'loading' },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'loading' })

    const accessError = normalizeRetentionError({ code: 'FORBIDDEN' }, 'read')
    expect(
      toRetentionAdminView({
        retention: { kind: 'failed', error: accessError },
        installation: { kind: 'failed', error: accessError },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'access-error', error: { kind: 'forbidden' } })

    expect(
      toRetentionAdminView({
        retention: {
          kind: 'failed',
          error: normalizeRetentionError({ code: 'NOT_FOUND' }, 'read'),
        },
        installation: {
          kind: 'ready',
          installation: { ...installation, status: 'uninitialized' },
          refreshing: false,
        },
        draft: null,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'not-initialized' })

    const stale: RetentionResource = {
      kind: 'stale',
      result,
      error: normalizeRetentionError({ code: 'INTERNAL_SERVER_ERROR' }, 'read'),
      refreshing: false,
    }
    expect(
      toRetentionAdminView({
        retention: stale,
        installation: { kind: 'ready', installation, refreshing: false },
        draft,
        command: { kind: 'idle' },
        notice: null,
      }),
    ).toMatchObject({ kind: 'ready', stale: true, lock: { kind: 'available' } })
  })
})
