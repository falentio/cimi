import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function createTempDataDir(prefix?: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix ?? 'cimi-'))
}

export async function removeTempDataDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true })
}
