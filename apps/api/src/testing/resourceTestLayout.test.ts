import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const resourcesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

const bannedTestFiles = new Set(['service.test.ts', 'repository.drizzle.test.ts'])

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
