import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { isNavItemActive, NAV_REGISTRY } from './nav-config'

const PAGES_DIR = fileURLToPath(new URL('../../../pages', import.meta.url))

const ALL_ITEMS = [NAV_REGISTRY.main, NAV_REGISTRY.sites, NAV_REGISTRY.secondary].flatMap(
  (group) => group.items,
)

describe('NAV_REGISTRY', () => {
  it('has unique nav targets across all groups', () => {
    const targets = ALL_ITEMS.map((item) => item.to)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('flags exactly the admin entries', () => {
    expect(ALL_ITEMS.filter((item) => item.admin).map((item) => item.to)).toEqual(['/admin'])
  })

  it('routes every nav target to an existing page file', () => {
    for (const item of ALL_ITEMS) {
      expect(pageFileExists(item.to), `${item.title} -> ${item.to}`).toBe(true)
    }
  })
})

describe('isNavItemActive', () => {
  it('matches the home target exactly', () => {
    expect(isNavItemActive('/', { to: '/' })).toBe(true)
    expect(isNavItemActive('/sites/ste_1', { to: '/' })).toBe(false)
  })

  it('matches section targets by path prefix', () => {
    expect(isNavItemActive('/settings/general', { to: '/settings' })).toBe(true)
    expect(isNavItemActive('/settings-elsewhere', { to: '/settings' })).toBe(false)
  })

  it('supports exact targets', () => {
    expect(isNavItemActive('/sites/ste_1/events', { to: '/sites/ste_1', exact: true })).toBe(false)
    expect(isNavItemActive('/sites/ste_1', { to: '/sites/ste_1', exact: true })).toBe(true)
  })
})

function pageFileExists(to: string): boolean {
  const segments = to.split('/').filter(Boolean)
  if (segments.length === 0) {
    return existsSync(join(PAGES_DIR, 'index.vue'))
  }
  return matchesPage(PAGES_DIR, segments)
}

function matchesPage(dir: string, segments: string[]): boolean {
  if (segments.length === 0) {
    return existsSync(join(dir, 'index.vue'))
  }
  const [head, ...rest] = segments
  const entries = readdirSync(dir)
  const fileHit =
    rest.length === 0 &&
    (entries.includes(`${head}.vue`) ||
      entries.some((entry) => isDynamic(entry) && entry.endsWith('.vue')))
  const dirHits = entries
    .filter((entry) => entry === head || (isDynamic(entry) && !entry.endsWith('.vue')))
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isDirectory())
  return fileHit || dirHits.some((path) => matchesPage(path, rest))
}

function isDynamic(entry: string): boolean {
  return entry.startsWith('[') && (entry.endsWith(']') || entry.endsWith('].vue'))
}
