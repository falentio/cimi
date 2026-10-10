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

function specifierCandidates(source: string, patterns: readonly RegExp[]): string[] {
  const found = new Set<string>()

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]

      if (specifier !== undefined && specifier.startsWith('.')) found.add(specifier)
    }
  }

  return [...found]
}

const importPatterns = [
  /from\s*['"]([^'"]+)['"]/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s+['"]([^'"]+)['"]/g,
]

const exportPatterns = [
  /export\s+(?:type\s+)?(?:\*|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/g,
  /export\s+\*\s+as\s+\w+\s+from\s*['"]([^'"]+)['"]/g,
]

function importedSpecifiers(source: string): string[] {
  return specifierCandidates(source, importPatterns)
}

function exportedSpecifiers(source: string): string[] {
  return specifierCandidates(source, exportPatterns)
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

// site/scope.ts is the documented shared scope adapter. Its rule is that it is the
// only resource module allowed to read site, organization, and membership tables, so
// a new consumer has to be added here deliberately rather than quietly.
const scopeConsumers = [
  'cohort-retention/index.ts',
  'collection-policy/index.ts',
  'event-report/index.ts',
  'funnel/index.ts',
  'goal/index.ts',
  'identity-profile/index.ts',
  'public-dashboard/index.ts',
  'retention-policy/index.ts',
  'traffic-report/index.ts',
]

function actualScopeConsumers(): string[] {
  return readdirSync(resourcesRoot)
    .flatMap((resource) => {
      const directory = join(resourcesRoot, resource)
      const files: string[] = []

      for (const file of productionFiles(directory)) {
        const source = readFileSync(file, 'utf8')

        if (importedSpecifiers(source).includes('../site/scope.ts'))
          files.push(relative(resourcesRoot, file))
      }

      return files
    })
    .sort()
}

// ADR 0008 bans a cross-resource repository import directly or under an alias. The
// walker resolves only relative specifiers, so an alias would slip past it. The repo
// configures no module paths, so the enforceable check is that it stays that way: a
// mapping that resolves into the resources tree reopens the hole.
function tsconfigFiles(): string[] {
  const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
  const repoRoot = resolve(apiDir, '..', '..')

  return [repoRoot, apiDir].map((root) => join(root, 'tsconfig.json'))
}

function pathsMappingIntoResources(configSource: string): string[] {
  const pathsBlock = /"paths"\s*:\s*\{([^}]*)\}/.exec(configSource)

  if (pathsBlock === null) return []

  const targets = /"[^"]*resources\/[^"]*"/g

  return [...(pathsBlock[1] ?? '').matchAll(targets)].map((match) => match[0])
}

test("resources do not depend on another resource's repository", () => {
  expect(productionFiles(resourcesRoot).length).toBeGreaterThan(100)
  expect(crossResourceRepositoryEdges()).toEqual([])
})

test('the scope adapter keeps its documented consumer set', () => {
  expect(actualScopeConsumers()).toEqual(scopeConsumers)
})

test('no module alias resolves into the resources tree', () => {
  const aliases = tsconfigFiles().flatMap((configPath) =>
    pathsMappingIntoResources(readFileSync(configPath, 'utf8')),
  )

  expect(aliases).toEqual([])
})
