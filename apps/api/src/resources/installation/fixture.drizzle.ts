import { closeDb, type Db } from '@cimi/db'
import { createMigratedTestDb } from '@cimi/db/testing'
import { InstallationRepositoryDrizzle } from './repository.drizzle.ts'
import type { InstallationRepository } from './repository.ts'

export const createdAt = new Date('2026-09-01T00:00:00.000Z')
export const updatedAt = new Date('2026-09-01T00:00:00.000Z')

export interface InstallationDrizzleFixture extends Disposable {
  readonly db: Db
  readonly repository: InstallationRepositoryDrizzle
}

export function createInstallationDrizzleFixture(): InstallationDrizzleFixture {
  const db = createMigratedTestDb()
  try {
    return {
      db,
      repository: new InstallationRepositoryDrizzle({ db }),
      [Symbol.dispose]() {
        closeDb(db)
      },
    }
  } catch (error) {
    closeDb(db)
    throw error
  }
}

export function createInstallationInsertInput(
  overrides: Partial<InstallationRepository.CreateInput> = {},
): InstallationRepository.CreateInput {
  return {
    id: 'ins_1',
    retentionPolicyId: 'rtn_1',
    eventMonths: 12,
    profileMonths: 12,
    replayMonths: null,
    dataDirectoryReady: true,
    createdAt,
    updatedAt,
    ...overrides,
  }
}

export function beginUpgradeInput(
  operationId: string,
  now: Date,
): InstallationRepository.BeginUpgradeInput {
  return {
    operationId,
    ownerToken: 'owner_1',
    activeOperation: {
      phase: 'pre_upgrade_safety',
      checkpoint: 'none',
      progress: 0 as number | null,
      lastSafeSequence: null as number | null,
      errorCode: null as null,
    },
    now,
  }
}

export function safetyArtifact(
  operationId = 'bop_1',
  artifactId = 'bar_1',
): InstallationRepository.SafetyArtifactInput {
  return {
    id: artifactId,
    generationId: operationId,
    storageKey: `safety/${operationId}.sqlite`,
    schemaVersion: '1',
    sizeBytes: 8,
    checksumAlgorithm: 'sha256',
    checksumValue: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  }
}
