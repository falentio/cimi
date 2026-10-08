import { readdir, unlink } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { BackupIncompatibilityError } from './errors.ts'

const SAFETY_STORAGE_KEY = /^safety\/[A-Za-z0-9_-]{1,64}\.sqlite$/

export function safetyArtifactStorageKey(operationId: string): string {
  return `safety/${operationId}.sqlite`
}

export function resolveSafetyArtifactPath(input: {
  readonly dataDirectoryPath: string
  readonly storageKey: string
}): string {
  if (!SAFETY_STORAGE_KEY.test(input.storageKey))
    throw new BackupIncompatibilityError('Safety artifact storage key is invalid')

  const root = resolve(input.dataDirectoryPath)
  const path = resolve(root, input.storageKey)
  const fromRoot = relative(root, path)

  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot))
    throw new BackupIncompatibilityError(
      'Safety artifact storage key is outside configured storage',
    )

  return path
}

/** Idempotent; tolerates a missing file. */
export async function reclaimSafetyArtifact(input: {
  readonly dataDirectoryPath: string
  readonly storageKey: string
}): Promise<void> {
  const path = resolveSafetyArtifactPath(input)

  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      await unlink(candidate)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
  }
}

const SAFETY_FILE_NAME = /^(safety\/)?([A-Za-z0-9_-]{1,64})\.sqlite(-wal|-shm)?$/

/** The main file and either sidecar name the same operation, so a sidecar-only orphan is found. */
export async function listSafetyArtifactOperationIds(input: {
  readonly dataDirectoryPath: string
}): Promise<readonly string[]> {
  let entries: string[]

  try {
    entries = await readdir(join(input.dataDirectoryPath, 'safety'))
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []

    throw error
  }

  const operationIds = new Set<string>()

  for (const name of entries) {
    const match = SAFETY_FILE_NAME.exec(name)

    if (match?.[2] !== undefined) operationIds.add(match[2])
  }

  return [...operationIds]
}
