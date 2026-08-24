import * as v from 'valibot'
import { describe, expect, it } from 'vitest'
import { SBackup } from './schema.ts'

const notApplicable = {
  status: 'not_applicable',
  startedAt: null,
  completedAt: null,
  errorCode: null,
} as const

const availableBackup = {
  id: 'backup-1',
  status: 'available',
  createdAt: '2026-08-23T00:00:00Z',
  completedAt: '2026-08-23T00:01:00Z',
  scope: 'installation',
  phase: 'ready',
  progress: 1,
  checkpoint: 'structurally_ready',
  lastSafeSequence: 42,
  readiness: { controlStore: 'ready', analyticsStore: 'ready', structural: 'ready' },
  cleanupPending: false,
  derivedCleanup: notApplicable,
  backupCleanup: notApplicable,
  restoreSourceBackupId: null,
  preRestoreSafetyArtifact: null,
  errorCode: null,
} as const

describe('backup and restore contract', () => {
  it('accepts the terminal available state with a complete polling surface', () => {
    expect(v.parse(SBackup, availableBackup)).toEqual(availableBackup)
  })

  it('accepts the documented restoring/ready checkpoint before atomic availability', () => {
    expect(
      v.parse(SBackup, {
        ...availableBackup,
        status: 'restoring',
        completedAt: null,
        restoreSourceBackupId: 'backup-old',
        preRestoreSafetyArtifact: {
          id: 'safety-1',
          createdAt: '2026-08-23T00:02:00Z',
          status: 'ready',
          lastSafeSequence: 42,
          errorCode: null,
        },
      }),
    ).toMatchObject({ status: 'restoring', phase: 'ready' })
  })

  it('rejects active completion timestamps and terminal missing timestamps', () => {
    expect(() =>
      v.parse(SBackup, { ...availableBackup, status: 'creating', phase: 'capturing_sqlite' }),
    ).toThrow(v.ValiError)
    expect(() => v.parse(SBackup, { ...availableBackup, completedAt: null })).toThrow(v.ValiError)
  })

  it('requires the derived cleanup stage to finish before backup cleanup', () => {
    expect(() =>
      v.parse(SBackup, {
        ...availableBackup,
        phase: 'cleanup_pending',
        cleanupPending: true,
        derivedCleanup: { ...notApplicable, status: 'pending' },
        backupCleanup: { ...notApplicable, status: 'running', startedAt: '2026-08-23T00:03:00Z' },
      }),
    ).toThrow(v.ValiError)
  })
})
