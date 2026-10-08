import { describe, expect, it } from 'vitest'
import {
  createInitialPublicDashboardState,
  reducePublicDashboard,
} from './public-dashboard.reducer'
import type { PublicDashboardConfig } from './public-dashboard.types'

const enabled: PublicDashboardConfig = {
  siteId: 'ste_1',
  enabled: true,
  publicDashboardIdentifier: 'identifier-one',
  updatedAt: '2026-10-08T10:00:00Z',
}

function ready(config: PublicDashboardConfig = enabled) {
  return reducePublicDashboard(createInitialPublicDashboardState(), {
    kind: 'config-received',
    config,
  })
}

describe('public-dashboard.reducer', () => {
  it('starts loading and adopts a config', () => {
    const initial = createInitialPublicDashboardState()

    expect(initial.config).toEqual({ kind: 'loading' })

    const next = ready()

    expect(next.config).toEqual({ kind: 'ready', config: enabled, refreshing: false })
    expect(next.command).toEqual({ kind: 'idle' })
    expect(next.notice).toBeNull()
  })

  it('treats an absent row as a ready, unconfigured Site', () => {
    const next = reducePublicDashboard(createInitialPublicDashboardState(), {
      kind: 'config-absent',
    })

    expect(next.config).toEqual({ kind: 'ready', config: null, refreshing: false })
  })

  it('keeps the last config and marks it stale when a refresh fails', () => {
    const error = {
      kind: 'server' as const,
      code: 'INTERNAL_SERVER_ERROR' as const,
      httpStatus: 500 as const,
      message: 'failed',
      action: 'refresh' as const,
    }

    const next = reducePublicDashboard(ready(), { kind: 'config-failed', error })

    expect(next.config).toEqual({ kind: 'stale', config: enabled, error, refreshing: false })
  })

  it('clears a failed command on the next accepted read', () => {
    const failed = reducePublicDashboard(ready(), {
      kind: 'operation-failed',
      operation: 'disable',
      error: {
        kind: 'conflict',
        code: 'CONFLICT',
        httpStatus: 409,
        message: 'conflict',
        action: 'refresh',
      },
    })

    expect(failed.command.kind).toBe('failed')

    const recovered = reducePublicDashboard(failed, { kind: 'config-received', config: enabled })

    expect(recovered.command).toEqual({ kind: 'idle' })
  })

  it('records the committed config and the operation notice on success', () => {
    const rotated: PublicDashboardConfig = {
      ...enabled,
      publicDashboardIdentifier: 'identifier-two',
      updatedAt: '2026-10-08T11:00:00Z',
    }

    const next = reducePublicDashboard(ready(), {
      kind: 'operation-succeeded',
      operation: 'rotate',
      config: rotated,
    })

    expect(next.config).toEqual({ kind: 'ready', config: rotated, refreshing: false })
    expect(next.notice).toMatchObject({ operation: 'rotate', warning: null })
    expect(next.notice?.message).toContain('previous public URL no longer resolves')
  })

  it('clears the enabled flag locally when disable returns no config', () => {
    const next = reducePublicDashboard(ready(), {
      kind: 'operation-succeeded',
      operation: 'disable',
      config: null,
    })

    expect(next.config).toEqual({
      kind: 'ready',
      config: { ...enabled, enabled: false },
      refreshing: false,
    })
    expect(next.notice?.message).toContain('authorizes no new public request')
  })

  it('refuses to open a confirmation while an operation is submitting', () => {
    const submitting = reducePublicDashboard(ready(), {
      kind: 'operation-started',
      operation: 'enable',
    })

    const next = reducePublicDashboard(submitting, {
      kind: 'operation-requested',
      operation: 'disable',
    })

    expect(next.command).toEqual({ kind: 'submitting', operation: 'enable' })
  })

  it('cancels only an open confirmation', () => {
    const confirming = reducePublicDashboard(ready(), {
      kind: 'operation-requested',
      operation: 'disable',
    })

    expect(reducePublicDashboard(confirming, { kind: 'operation-cancelled' }).command).toEqual({
      kind: 'idle',
    })

    const submitting = reducePublicDashboard(confirming, {
      kind: 'operation-started',
      operation: 'disable',
    })

    expect(reducePublicDashboard(submitting, { kind: 'operation-cancelled' }).command).toEqual({
      kind: 'submitting',
      operation: 'disable',
    })
  })

  it('attaches a refresh warning to the existing notice', () => {
    const committed = reducePublicDashboard(ready(), {
      kind: 'operation-succeeded',
      operation: 'enable',
      config: enabled,
    })

    const warning = {
      kind: 'retryable' as const,
      code: undefined,
      httpStatus: undefined,
      message: 'stale',
      action: 'refresh' as const,
    }

    const next = reducePublicDashboard(committed, { kind: 'notice-warning', error: warning })

    expect(next.notice).toMatchObject({ operation: 'enable', warning })
    expect(next.config.kind).toBe('ready')
  })
})
