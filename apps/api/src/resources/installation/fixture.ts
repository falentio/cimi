import { InMemoryAcceptanceJournalPort, InMemoryLifecycleLock } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { InstallationRepository } from './repository.ts'
import { InstallationService, type UpgradeExecutor } from './service.ts'
import type { InstallationIdFactory } from './service.ts'

export interface InstallationFixtureOptions {
  readonly dataDirectoryReady?: boolean
  readonly clock?: (() => Date) | undefined
  readonly ids?: InstallationIdFactory | undefined
  readonly upgradeExecutor?: UpgradeExecutor | undefined
}

export function createInstallationFixture(options: InstallationFixtureOptions = {}) {
  const repository = mock<InstallationRepository>()
  const lock = new InMemoryLifecycleLock()
  const journal = new InMemoryAcceptanceJournalPort()
  const service = new InstallationService({
    repository,
    lock,
    journal,
    dataDirectoryReady: options.dataDirectoryReady ?? true,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    upgradeExecutor: options.upgradeExecutor ?? createFakeUpgradeExecutor(),
  })
  return { repository, lock, journal, service }
}

export function createFakeUpgradeExecutor(
  overrides: Partial<UpgradeExecutor> = {},
): UpgradeExecutor {
  return {
    createSafetyArtifact: async ({ operationId, artifactId }) => ({
      id: artifactId,
      generationId: operationId,
      storageKey: `safety/${operationId}.sqlite`,
      schemaVersion: '1',
      sizeBytes: 8,
      checksumAlgorithm: 'sha256',
      checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    }),
    migrate: async () => undefined,
    rebuildAnalytics: async () => undefined,
    rollback: async () => undefined,
    ...overrides,
  }
}

const updatedAt = '2026-09-01T00:00:00.000Z'

export function createInstallationRecord(
  overrides: Partial<InstallationRepository.Record> = {},
): InstallationRepository.Record {
  return {
    id: 'ins_1',
    status: 'ready',
    defaultRetention: { eventMonths: 12, profileMonths: 12, replayMonths: null },
    dataDirectoryReady: true,
    activeOperation: null,
    cleanupPending: false,
    derivedCleanup: {
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    backupCleanup: {
      status: 'not_applicable',
      startedAt: null,
      completedAt: null,
      errorCode: null,
    },
    updatedAt,
    ...overrides,
  }
}
