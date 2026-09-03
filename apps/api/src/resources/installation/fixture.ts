import { InMemoryAcceptanceJournalPort, InMemoryLifecycleLock } from '@cimi/kernel'
import { mock } from 'vitest-mock-extended'
import type { InstallationRepository } from './repository.ts'
import { InstallationService } from './service.ts'
import type { InstallationIdFactory, UpgradeArtifactPort } from './service.ts'

export interface InstallationFixtureOptions {
  readonly clock?: (() => Date) | undefined
  readonly ids?: InstallationIdFactory | undefined
  readonly upgradeArtifact?: UpgradeArtifactPort | undefined
}

export function createInstallationFixture(options: InstallationFixtureOptions = {}) {
  const repository = mock<InstallationRepository>()
  const lock = new InMemoryLifecycleLock()
  const journal = new InMemoryAcceptanceJournalPort()
  const service = new InstallationService({
    repository,
    lock,
    journal,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.ids === undefined ? {} : { ids: options.ids }),
    ...(options.upgradeArtifact === undefined ? {} : { upgradeArtifact: options.upgradeArtifact }),
  })
  return { repository, lock, journal, service }
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
