import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AuthUser } from '@cimi/auth'
import { closeDb, createDb, migrateControlDb } from '@cimi/db'
import { createTestAnalyticsDb } from '@cimi/db/testing'
import {
  InMemoryAcceptanceQuiescencePort,
  InMemoryLifecycleLock,
  InMemoryReadQuiescencePort,
} from '@cimi/kernel'
import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import { ConfiguredSqliteExecutor } from '../executor.ts'
import type { BackupRestoreRepository } from '../repository.ts'
import { BackupRestoreService } from '../service.ts'

const admin: AuthUser = {
  id: 'user_1',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  email: 'admin@example.com',
  emailVerified: true,
  name: 'Admin',
  banned: false,
  role: 'admin',
  installationGrant: true,
}

type Corruption = 'header-magic' | 'zeroed-page' | 'freelist-lie'

function corruptArtifactBytes(bytes: Buffer, corruption: Corruption): Buffer {
  const copy = Buffer.from(bytes)
  const pageSize = copy.readUInt16BE(16) === 1 ? 65536 : copy.readUInt16BE(16)

  switch (corruption) {
    case 'header-magic':
      copy.fill(0, 0, 4)

      return copy
    case 'zeroed-page':
      copy.fill(0, pageSize * 4, Math.min(pageSize * 5, copy.length))

      return copy
    case 'freelist-lie':
      copy.writeUInt32BE(200, 36)

      return copy
  }
}

async function restoreCorruptedArtifact(corruption: Corruption): Promise<Error> {
  const directory = await mkdtemp(join(tmpdir(), 'cimi-unreadable-artifact-'))
  const controlDatabasePath = join(directory, 'control.sqlite')
  const db = createDb({ path: controlDatabasePath })
  migrateControlDb(db)
  const analytics = await createTestAnalyticsDb()

  try {
    const executor = new ConfiguredSqliteExecutor({
      db,
      analytics,
      controlDatabasePath,
      dataDirectoryPath: directory,
    })

    const source = await executor.captureBackup({
      operationId: 'bop_1',
      artifactId: 'bar_1',
      lastSafeSequence: 9,
    })

    const artifactPath = join(directory, source.storageKey)
    const corrupted = corruptArtifactBytes(await readFile(artifactPath), corruption)
    await writeFile(artifactPath, corrupted)
    const repository = mock<BackupRestoreRepository>()
    repository.findSourceManifest.mockResolvedValue({
      ...source,
      sizeBytes: corrupted.byteLength,
      checksumValue: createHash('sha256').update(corrupted).digest('hex'),
    })

    const service = new BackupRestoreService({
      repository,
      executor,
      lock: new InMemoryLifecycleLock(),
      acceptance: new InMemoryAcceptanceQuiescencePort(),
      reads: new InMemoryReadQuiescencePort(),
      dataDirectoryReady: true,
    })

    try {
      await service.restoreBackup({ backupId: 'bop_1', confirmation: 'RESTORE' }, admin)
    } catch (cause) {
      if (cause instanceof Error) return cause

      throw cause
    }

    throw new Error('restoreBackup resolved without throwing')
  } finally {
    await analytics.close()
    closeDb(db)
    await rm(directory, { recursive: true, force: true })
  }
}

describe('BackupRestoreService.unreadableArtifact', () => {
  it('rejects an artifact with a wiped header as an incompatible backup', async () => {
    const error = await restoreCorruptedArtifact('header-magic')

    expect(error).toMatchObject({ code: 'INCOMPATIBLE_BACKUP', status: 422 })
  })

  it('rejects an artifact whose integrity check throws as an incompatible backup', async () => {
    const error = await restoreCorruptedArtifact('zeroed-page')

    expect(error).toMatchObject({ code: 'INCOMPATIBLE_BACKUP', status: 422 })
  })

  it('rejects an artifact whose integrity check reports damage as an incompatible backup', async () => {
    const error = await restoreCorruptedArtifact('freelist-lie')

    expect(error).toMatchObject({ code: 'INCOMPATIBLE_BACKUP', status: 422 })
  })
})
