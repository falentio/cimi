import { readdirSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const resourcesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

const bannedTestFiles = new Set(['service.test.ts', 'repository.drizzle.test.ts'])

function resourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return resourceFiles(path)

    return entry.isFile() ? [path] : []
  })
}

function testingDirectories(): string[] {
  return readdirSync(resourcesRoot)
    .filter((name) => statSync(join(resourcesRoot, name)).isDirectory())
    .map((name) => join(resourcesRoot, name, 'testing'))
    .filter((path) => {
      try {
        return statSync(path).isDirectory()
      } catch {
        return false
      }
    })
}

test('resource tests live in a testing directory', () => {
  const offenders = resourceFiles(resourcesRoot).filter(
    (path) => path.endsWith('.test.ts') && basename(dirname(path)) !== 'testing',
  )

  expect(offenders).toEqual([])
})

test('resource testing directories use per-method test files', () => {
  const offenders: string[] = []

  for (const directory of testingDirectories()) {
    for (const file of readdirSync(directory)) {
      if (bannedTestFiles.has(file)) {
        offenders.push(join(directory, file))
      }
    }
  }

  expect(offenders).toEqual([])
})
