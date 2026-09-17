import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createApiServerApp, type ApiServerApp } from '@cimi/api/server'

let apiAppPromise: Promise<ApiServerApp> | undefined
let migrationsFolder: string | undefined
let closePromise: Promise<void> | undefined

export function getWebApiApp(): Promise<ApiServerApp> {
  apiAppPromise ??= createWebApiApp()
  return apiAppPromise
}

export function closeWebApiApp(): Promise<void> {
  closePromise ??= closeWebApiAppOnce()
  return closePromise
}

async function createWebApiApp(): Promise<ApiServerApp> {
  const folder = await materializeMigrations()
  migrationsFolder = folder
  try {
    return await createApiServerApp({ migrationsFolder: folder })
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    migrationsFolder = undefined
    throw error
  }
}

async function closeWebApiAppOnce(): Promise<void> {
  try {
    if (apiAppPromise !== undefined) await (await apiAppPromise).close()
  } finally {
    if (migrationsFolder !== undefined) {
      await rm(migrationsFolder, { recursive: true, force: true })
      migrationsFolder = undefined
    }
  }
}

async function materializeMigrations(): Promise<string> {
  const storage = useStorage('assets:control-migrations')
  const keys = await storage.getKeys()
  if (keys.length === 0) throw new Error('Control migration assets are missing')

  const folder = await mkdtemp(join(tmpdir(), 'cimi-control-migrations-'))
  try {
    for (const key of keys) {
      const content: unknown = await storage.getItem(key)
      if (content === null) throw new Error(`Control migration asset is missing: ${key}`)
      const serialized = typeof content === 'string' ? content : JSON.stringify(content)
      if (serialized === undefined) throw new Error(`Control migration asset is invalid: ${key}`)
      const path = join(folder, key.replaceAll(':', '/'))
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, serialized, 'utf8')
    }
    return folder
  } catch (error) {
    await rm(folder, { recursive: true, force: true })
    throw error
  }
}
