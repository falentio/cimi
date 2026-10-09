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
  it('starts loading and adopts a configured Site', () => {
    const initial = createInitialPublicDashboardState()

    expect(initial.config).toEqual({ kind: 'loading' })

    const next = ready()

    expect(next.config).toEqual({
      kind: 'ready',
      configuration: { kind: 'configured', config: enabled },
      refreshing: false,
    })
    expect(next.command).toEqual({ kind: 'idle' })
    expect(next.notice).toBeNull()
  })

  it('records a Site with no stored dashboard as unconfigured, not as an error', () => {
    const next = reducePublicDashboard(createInitialPublicDashboardState(), {
      kind: 'config-absent',
    })

    expect(next.config).toEqual({
      kind: 'ready',
      configuration: { kind: 'unconfigured' },
      refreshing: false,
    })
  })

  it('keeps the last configuration and marks it stale when a refresh fails', () => {
    const error = {
      kind: 'server' as const,
      code: 'INTERNAL_SERVER_ERROR' as const,
      httpStatus: 500 as const,
      message: 'failed',
      action: 'refresh' as const,
    }

    const next = reducePublicDashboard(ready(), { kind: 'config-failed', error })

    expect(next.config).toEqual({
      kind: 'stale',
      configuration: { kind: 'configured', config: enabled },
      error,
      refreshing: false,
    })
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

  it('adopts the issued identifier and the operation notice', () => {
    const rotated: PublicDashboardConfig = {
      ...enabled,
      publicDashboardIdentifier: 'identifier-two',
      updatedAt: '2026-10-08T11:00:00Z',
    }

    const next = reducePublicDashboard(ready(), {
      kind: 'identifier-issued',
      operation: 'rotate',
      config: rotated,
    })

    expect(next.config).toEqual({
      kind: 'ready',
      configuration: { kind: 'configured', config: rotated },
      refreshing: false,
    })
    expect(next.notice).toMatchObject({ operation: 'rotate', warning: null })
    expect(next.notice?.message).toContain('previous public URL no longer resolves')
  })

  it('announces the first identifier when a Site that never enabled it is enabled', () => {
    const unconfigured = reducePublicDashboard(createInitialPublicDashboardState(), {
      kind: 'config-absent',
    })

    const next = reducePublicDashboard(unconfigured, {
      kind: 'identifier-issued',
      operation: 'enable',
      config: enabled,
    })

    expect(next.notice?.message).toContain('the first identifier was issued')
    expect(next.notice?.message).not.toContain('no longer resolves')
  })

  it('announces a revoked earlier identifier when a disabled Site is enabled', () => {
    const disabled = reducePublicDashboard(ready(), { kind: 'access-revoked' })

    const next = reducePublicDashboard(disabled, {
      kind: 'identifier-issued',
      operation: 'enable',
      config: enabled,
    })

    expect(next.notice?.message).toContain('a new identifier was issued')
    expect(next.notice?.message).toContain('no longer resolves')
  })

  it('clears the enabled flag on revoke because disable returns no body', () => {
    const next = reducePublicDashboard(ready(), { kind: 'access-revoked' })

    expect(next.config).toEqual({
      kind: 'ready',
      configuration: {
        kind: 'configured',
        config: { ...enabled, enabled: false },
      },
      refreshing: false,
    })
    expect(next.notice?.message).toContain('authorizes no new public request')
  })

  it('keeps a revoke on an unconfigured Site unconfigured', () => {
    const unconfigured = reducePublicDashboard(createInitialPublicDashboardState(), {
      kind: 'config-absent',
    })

    const next = reducePublicDashboard(unconfigured, { kind: 'access-revoked' })

    expect(next.config).toEqual({
      kind: 'ready',
      configuration: { kind: 'unconfigured' },
      refreshing: false,
    })
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
      kind: 'identifier-issued',
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
