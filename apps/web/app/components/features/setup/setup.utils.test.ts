import { describe, expect, it } from 'vitest'
import type {
  Health,
  InitializeResponse,
  Installation,
  SetupHealth,
  SetupInstallation,
} from './setup.types'
import {
  canStartUpgrade,
  describeHealth,
  deriveLifecycleView,
  deriveSetupView,
  isExactUpgradeConfirmation,
  mapInitializeResponse,
  mapSetupError,
  toHealthResource,
  toInstallationResource,
} from './setup.utils'
import { MAX_POLL_ATTEMPTS } from './setup.types'

const cleanupStage = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const operation = {
  operationId: 'op_1',
  kind: 'upgrade',
  phase: 'pre_upgrade_safety',
  checkpoint: 'sqlite_captured',
  progress: 0.5,
  lastSafeSequence: 4,
  errorCode: null,
} as const

const installation = {
  status: 'ready',
  defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
  dataDirectoryReady: true,
  activeOperation: null,
  cleanupPending: false,
  derivedCleanup: cleanupStage,
  backupCleanup: cleanupStage,
  updatedAt: '2026-09-17T00:00:00Z',
} satisfies Installation

const health = {
  status: 'healthy',
  controlStore: 'ready',
  analyticsStore: 'ready',
  cleanupPending: false,
  version: '1.0.0',
  checkedAt: '2026-09-17T00:00:00Z',
} satisfies Health

const setupInstallation = {
  status: installation.status,
  dataDirectoryReady: installation.dataDirectoryReady,
  activeOperation: installation.activeOperation,
  cleanupPending: installation.cleanupPending,
  derivedCleanup: installation.derivedCleanup,
  backupCleanup: installation.backupCleanup,
  updatedAt: installation.updatedAt,
} satisfies SetupInstallation

const setupHealth = {
  status: health.status,
  controlStore: health.controlStore,
  analyticsStore: health.analyticsStore,
  cleanupPending: health.cleanupPending,
  version: health.version,
  checkedAt: health.checkedAt,
} satisfies SetupHealth

describe('setup.utils', () => {
  it('keeps 404 as the initialization path and maps authorization independently', () => {
    expect(
      toInstallationResource({
        data: undefined,
        error: { code: 'NOT_FOUND', status: 404 },
        isLoading: false,
      }),
    ).toEqual({ kind: 'not-found', httpStatus: 404 })
    expect(
      toInstallationResource({
        data: undefined,
        error: { code: 'UNAUTHORIZED', status: 401 },
        isLoading: false,
      }),
    ).toEqual({ kind: 'unauthorized', httpStatus: 401 })
    expect(
      toInstallationResource({
        data: undefined,
        error: { code: 'FORBIDDEN', status: 403 },
        isLoading: false,
      }),
    ).toEqual({ kind: 'forbidden', httpStatus: 403 })
  })

  it('preserves a known uninitialized installation record', () => {
    const knownUninitialized = { ...setupInstallation, status: 'uninitialized' as const }
    const resource = toInstallationResource({
      data: { ...installation, status: 'uninitialized' },
      error: undefined,
      isLoading: false,
    })

    expect(resource).toEqual({ kind: 'ready', installation: knownUninitialized })
    expect(
      deriveSetupView({
        installation: resource,
        health: { kind: 'ready', health: setupHealth },
        initialization: { kind: 'available' },
        upgrade: { kind: 'available' },
        polling: { kind: 'idle' },
        notice: undefined,
      }),
    ).toMatchObject({ kind: 'not-initialized' })
  })

  it('maps retryable failures to fixed feature copy', () => {
    const resource = toInstallationResource({
      data: undefined,
      error: new Error('provider path and SQL details must not escape'),
      isLoading: false,
    })
    expect(resource).toMatchObject({
      kind: 'failure',
      error: {
        kind: 'retryable',
        message: 'Installation status could not be loaded. Refresh and try again.',
      },
    })
    expect(JSON.stringify(resource)).not.toContain('provider path')
    expect(mapSetupError({ code: 'CONFLICT', status: 409 }, 'upgrade')).toMatchObject({
      kind: 'conflict',
      action: 'refresh',
    })
  })

  it('describes every health status and keeps partial stores visible', () => {
    const statuses = ['healthy', 'degraded', 'recovering', 'maintenance', 'unavailable'] as const
    for (const status of statuses) {
      const report = {
        ...setupHealth,
        status,
        controlStore: status === 'unavailable' ? 'unavailable' : 'ready',
        analyticsStore: status === 'healthy' ? 'ready' : 'degraded',
        cleanupPending: status === 'degraded',
      } satisfies SetupHealth
      const description = describeHealth(report)
      expect(description.title.toLowerCase()).toBe(status)
      expect(description.description).not.toContain('provider')
    }

    const partial = toHealthResource({
      data: { ...health, status: 'degraded', analyticsStore: 'degraded', cleanupPending: true },
      error: undefined,
      isLoading: false,
    })
    expect(partial).toEqual({
      kind: 'ready',
      health: {
        ...setupHealth,
        status: 'degraded',
        analyticsStore: 'degraded',
        cleanupPending: true,
      },
    })
  })

  it('distinguishes first initialization from convergent reuse', () => {
    const created = mapInitializeResponse({
      status: 201,
      body: installation,
    } satisfies InitializeResponse)
    const reused = mapInitializeResponse({
      status: 200,
      body: installation,
    } satisfies InitializeResponse)
    expect(created).toMatchObject({
      kind: 'created',
      httpStatus: 201,
      installation: setupInstallation,
    })
    expect(reused).toMatchObject({
      kind: 'reused',
      httpStatus: 200,
      installation: setupInstallation,
    })
  })

  it('accepts only the exact upgrade confirmation', () => {
    expect(isExactUpgradeConfirmation('UPGRADE')).toBe(true)
    expect(isExactUpgradeConfirmation('upgrade')).toBe(false)
    expect(isExactUpgradeConfirmation('UPGRADE ')).toBe(false)
  })

  it('derives active, terminal, and exhausted lifecycle states', () => {
    const active = {
      ...installation,
      activeOperation: operation,
      status: 'maintenance' as const,
    } satisfies Installation
    const initialized = {
      ...setupInstallation,
      status: active.status,
      activeOperation: active.activeOperation,
    } satisfies SetupInstallation
    expect(
      deriveLifecycleView(initialized, {
        kind: 'active',
        attempt: 2,
        maxAttempts: MAX_POLL_ATTEMPTS,
      }),
    ).toMatchObject({ kind: 'running' })

    const terminal = { ...operation, errorCode: 'UPGRADE_FAILED' as const }
    expect(
      deriveLifecycleView({ ...initialized, activeOperation: terminal }, { kind: 'idle' }),
    ).toMatchObject({ kind: 'failed' })
    expect(
      deriveLifecycleView(
        { ...initialized, activeOperation: null },
        { kind: 'exhausted', attempts: MAX_POLL_ATTEMPTS, maxAttempts: MAX_POLL_ATTEMPTS },
      ),
    ).toMatchObject({ kind: 'idle' })
  })

  it('allows retrying a failed upgrade but blocks other lifecycle operations', () => {
    const failedUpgrade = {
      ...installation,
      status: 'degraded' as const,
      activeOperation: { ...operation, errorCode: 'UPGRADE_FAILED' as const },
    } satisfies Installation
    const failedSiteOperation = {
      ...installation,
      status: 'degraded' as const,
      activeOperation: {
        ...operation,
        kind: 'site_deletion' as const,
        errorCode: 'CLEANUP_FAILED' as const,
      },
    } satisfies Installation

    const failedUpgradeLifecycle = deriveLifecycleView(
      { ...setupInstallation, ...failedUpgrade, activeOperation: failedUpgrade.activeOperation },
      { kind: 'idle' },
    )
    const failedSiteLifecycle = deriveLifecycleView(
      {
        ...setupInstallation,
        ...failedSiteOperation,
        activeOperation: failedSiteOperation.activeOperation,
      },
      { kind: 'idle' },
    )

    expect(
      canStartUpgrade(
        {
          ...setupInstallation,
          status: 'degraded',
          activeOperation: failedUpgrade.activeOperation,
        },
        failedUpgradeLifecycle,
      ),
    ).toBe(true)
    expect(
      canStartUpgrade(
        {
          ...setupInstallation,
          status: 'degraded',
          activeOperation: failedSiteOperation.activeOperation,
        },
        failedSiteLifecycle,
      ),
    ).toBe(false)
  })

  it('keeps health data renderable while installation access is denied', () => {
    const view = deriveSetupView({
      installation: { kind: 'forbidden', httpStatus: 403 },
      health: { kind: 'ready', health: setupHealth },
      initialization: { kind: 'available' },
      upgrade: { kind: 'available' },
      polling: { kind: 'idle' },
      notice: undefined,
    })
    expect(view.kind).toBe('admin-required')
    expect(view.health).toMatchObject({ kind: 'report', report: setupHealth })
  })
})
