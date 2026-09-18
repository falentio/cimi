import { describe, expect, it } from 'vitest'
import type {
  Health,
  Installation,
  SetupHealth,
  SetupInstallation,
  SetupOperation,
} from '../setup/setup.types'
import {
  ADMIN_OPERATION_LINKS,
  HEALTH_MATRIX,
  toAdminOperationsView,
} from './admin-operations.utils'
import { deriveSetupView, toHealthResource, toInstallationResource } from '../setup/setup.utils'

const notApplicableCleanup = {
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
  derivedCleanup: notApplicableCleanup,
  backupCleanup: notApplicableCleanup,
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

function setupView(options: {
  readonly installation?: ReturnType<typeof toInstallationResource>
  readonly health?: ReturnType<typeof toHealthResource>
}) {
  return deriveSetupView({
    installation: options.installation ?? { kind: 'ready', installation: setupInstallation },
    health: options.health ?? { kind: 'ready', health: setupHealth },
    initialization: { kind: 'available' },
    upgrade: { kind: 'available' },
    polling: { kind: 'idle' },
    notice: undefined,
  })
}

describe('admin-operations.utils', () => {
  it('keeps the documented health matrix complete and ordered', () => {
    expect(HEALTH_MATRIX.map(({ status }) => status)).toEqual([
      'healthy',
      'degraded',
      'recovering',
      'maintenance',
      'unavailable',
    ])
    expect(HEALTH_MATRIX).toHaveLength(5)
  })

  it('projects every health status and preserves independent store readiness', () => {
    const reports = {
      healthy: { ...health, status: 'healthy', controlStore: 'ready', analyticsStore: 'ready' },
      degraded: {
        ...health,
        status: 'degraded',
        controlStore: 'ready',
        analyticsStore: 'unavailable',
      },
      recovering: {
        ...health,
        status: 'recovering',
        controlStore: 'ready',
        analyticsStore: 'rebuilding',
      },
      maintenance: {
        ...health,
        status: 'maintenance',
        controlStore: 'ready',
        analyticsStore: 'degraded',
      },
      unavailable: {
        ...health,
        status: 'unavailable',
        controlStore: 'unavailable',
        analyticsStore: 'unavailable',
      },
    } satisfies Record<Health['status'], Health>

    for (const report of Object.values(reports)) {
      const projection = toAdminOperationsView(
        setupView({
          health: toHealthResource({ data: report, error: undefined, isLoading: false }),
        }),
      )
      expect(projection.health.kind).toBe('report')
      if (projection.health.kind !== 'report') continue
      expect(projection.health.report.matrix).toHaveLength(5)
      expect(projection.health.report.title.toLowerCase()).toBe(report.status)
    }

    const degraded = toAdminOperationsView(
      setupView({
        health: toHealthResource({
          data: { ...health, status: 'degraded', analyticsStore: 'unavailable' },
          error: undefined,
          isLoading: false,
        }),
      }),
    )
    expect(degraded.health).toMatchObject({
      kind: 'report',
      report: { status: 'degraded', controlStore: 'ready', analyticsStore: 'unavailable' },
    })
  })

  it('keeps health and installation failure or stale states independent', () => {
    const staleHealth = toAdminOperationsView(
      setupView({
        health: toHealthResource({
          data: health,
          error: new Error('provider path /tmp/private and SQL secret'),
          isLoading: false,
        }),
      }),
    )
    expect(staleHealth.health.kind).toBe('stale-report')
    expect(staleHealth.installation.kind).toBe('report')
    expect(JSON.stringify(staleHealth)).not.toContain('provider path')
    expect(JSON.stringify(staleHealth)).not.toContain('SQL secret')

    const installationFailure = toAdminOperationsView(
      setupView({
        installation: toInstallationResource({
          data: undefined,
          error: new Error('provider path /tmp/private and SQL secret'),
          isLoading: false,
        }),
      }),
    )
    expect(installationFailure.installation).toMatchObject({ kind: 'failure' })
    expect(installationFailure.health).toMatchObject({ kind: 'report' })
    expect(JSON.stringify(installationFailure)).not.toContain('provider path')
    expect(JSON.stringify(installationFailure)).not.toContain('SQL secret')

    const staleInstallationAndHealthFailure = toAdminOperationsView(
      setupView({
        installation: toInstallationResource({
          data: installation,
          error: new Error('filesystem path /srv/cimi and secret SQL text'),
          isLoading: false,
        }),
        health: toHealthResource({
          data: undefined,
          error: new Error('filesystem path /srv/cimi and secret SQL text'),
          isLoading: false,
        }),
      }),
    )
    expect(staleInstallationAndHealthFailure.installation.kind).toBe('stale-report')
    expect(staleInstallationAndHealthFailure.health.kind).toBe('failure')
    expect(JSON.stringify(staleInstallationAndHealthFailure)).not.toContain('filesystem path')
    expect(JSON.stringify(staleInstallationAndHealthFailure)).not.toContain('secret SQL text')
  })

  it('keeps the documented matrix visible while health data loads or fails', () => {
    const loading = toAdminOperationsView(setupView({ health: { kind: 'loading' } }))
    const failed = toAdminOperationsView(
      setupView({
        health: toHealthResource({
          data: undefined,
          error: new Error('health provider details'),
          isLoading: false,
        }),
      }),
    )

    expect(loading.health).toMatchObject({ kind: 'loading', matrix: HEALTH_MATRIX })
    expect(failed.health).toMatchObject({ kind: 'failure', matrix: expect.any(Array) })
    if (failed.health.kind === 'failure') expect(failed.health.matrix).toHaveLength(5)
  })

  it('projects site lifecycle correlation metadata without exposing transport details', () => {
    const operation = {
      operationId: 'operation-site-delete-1',
      kind: 'site_deletion',
      phase: 'site_transition',
      checkpoint: 'structurally_ready',
      progress: null,
      lastSafeSequence: 42,
      errorCode: null,
    } satisfies SetupOperation
    const activeInstallation = {
      ...installation,
      status: 'maintenance',
      activeOperation: operation,
    } satisfies Installation
    const projection = toAdminOperationsView(
      setupView({
        installation: toInstallationResource({
          data: activeInstallation,
          error: undefined,
          isLoading: false,
        }),
      }),
    )

    expect(projection.installation).toMatchObject({
      kind: 'report',
      status: 'maintenance',
      lifecycle: {
        kind: 'active',
        operation: {
          status: 'active',
          operationId: 'operation-site-delete-1',
          operationKind: 'site_deletion',
          phase: 'site_transition',
          checkpoint: 'structurally_ready',
          progress: null,
          lastSafeSequence: 42,
        },
      },
    })
  })

  it('keeps cleanup stages ordered and reports their safe timestamps', () => {
    const cleanupInstallation = {
      ...installation,
      cleanupPending: true,
      derivedCleanup: {
        status: 'completed',
        startedAt: '2026-09-17T01:00:00Z',
        completedAt: '2026-09-17T01:02:00Z',
        errorCode: null,
      },
      backupCleanup: {
        status: 'running',
        startedAt: '2026-09-17T01:03:00Z',
        completedAt: null,
        errorCode: null,
      },
    } satisfies Installation
    const projection = toAdminOperationsView(
      setupView({
        installation: toInstallationResource({
          data: cleanupInstallation,
          error: undefined,
          isLoading: false,
        }),
      }),
    )

    expect(projection.installation).toMatchObject({
      kind: 'report',
      cleanup: {
        pending: true,
        stages: [
          { kind: 'derived', status: 'completed', completedAt: '2026-09-17T01:02:00Z' },
          { kind: 'backup', status: 'running', startedAt: '2026-09-17T01:03:00Z' },
        ],
      },
    })
  })

  it('exposes only descriptive links to the existing admin destinations', () => {
    expect(ADMIN_OPERATION_LINKS).toEqual([
      { href: '/admin/backup-restore', label: 'Read backup and restore status' },
      { href: '/admin/retention', label: 'Review retention settings' },
    ])
  })
})
