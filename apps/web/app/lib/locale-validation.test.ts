import en from '../../i18n/locales/en.json'
import fr from '../../i18n/locales/fr.json'
import { describe, expect, it } from 'vitest'

type LocaleLeaf = { message: string; path: string }

function collectLeaves(value: unknown, path = ''): LocaleLeaf[] {
  if (typeof value === 'string') return [{ message: value, path }]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return []

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, path ? `${path}.${key}` : key),
  )
}

function interpolationShape(message: string): string[] {
  return (message.match(/{[^{}]+}/g) ?? []).sort()
}

const englishLeaves = collectLeaves(en.validation.auth)
const frenchLeaves = collectLeaves(fr.validation.auth)
const frenchByPath = new Map(frenchLeaves.map((leaf) => [leaf.path, leaf]))

describe('auth validation locale messages', () => {
  it('keeps the validation.auth key tree and interpolation shapes aligned', () => {
    expect(frenchLeaves.map(({ path }) => path).sort()).toEqual(
      englishLeaves.map(({ path }) => path).sort(),
    )

    for (const { message, path } of englishLeaves) {
      const frenchLeaf = frenchByPath.get(path)

      expect(frenchLeaf?.message, path).toBeDefined()
      if (!frenchLeaf) continue

      expect(frenchLeaf.message.trim(), path).not.toBe('')
      expect(interpolationShape(frenchLeaf.message), path).toEqual(interpolationShape(message))
    }
  })
})
