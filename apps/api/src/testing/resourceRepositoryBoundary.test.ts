import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const resourcesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources')

const repositoryModule = /\/repository(\.drizzle)?\.ts$/

function productionFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)

    if (statSync(path).isDirectory()) return entry === 'testing' ? [] : productionFiles(path)

    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

function importedSpecifiers(source: string): string[] {
  const patterns = [
    /from\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ]

  const found = new Set<string>()

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]

      if (specifier !== undefined && specifier.startsWith('.')) found.add(specifier)
    }
  }

  return [...found]
}

function exportedSpecifiers(source: string): string[] {
  const patterns = [
    /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
    /export\s+\*\s+as\s+\w+\s+from\s*['"]([^'"]+)['"]/g,
  ]

  const found = new Set<string>()

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]

      if (specifier !== undefined && specifier.startsWith('.')) found.add(specifier)
    }
  }

  return [...found]
}

function reExportsRepository(barrelPath: string): boolean {
  return exportedSpecifiers(readFileSync(barrelPath, 'utf8')).some((specifier) =>
    repositoryModule.test(resolve(dirname(barrelPath), specifier)),
  )
}

function resourceOf(path: string): string {
  return relative(resourcesRoot, path).split(sep)[0] ?? ''
}

function importedModules(fromFile: string, specifier: string): string[] {
  const base = resolve(dirname(fromFile), specifier)
  const candidates = [base, join(base, 'index.ts')]

  return candidates.filter(
    (candidate) => candidate.startsWith(resourcesRoot) && existsSync(candidate),
  )
}

function crossResourceRepositoryEdges(): string[] {
  const edges: string[] = []

  for (const file of productionFiles(resourcesRoot)) {
    const importer = relative(resourcesRoot, file)

    for (const specifier of importedSpecifiers(readFileSync(file, 'utf8'))) {
      const targets = importedModules(file, specifier)

      if (targets.length === 0) continue

      if (targets.every((target) => resourceOf(target) === resourceOf(file))) continue

      const leaks = targets.some(
        (target) =>
          repositoryModule.test(target) ||
          (target.endsWith(`${sep}index.ts`) && reExportsRepository(target)),
      )

      if (leaks) edges.push(`${importer}|${specifier}`)
    }
  }

  return edges
}

test("resources do not depend on another resource's repository", () => {
  expect(productionFiles(resourcesRoot).length).toBeGreaterThan(100)
  expect(crossResourceRepositoryEdges()).toEqual([])
})
