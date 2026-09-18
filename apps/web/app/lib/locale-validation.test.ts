import { ERROR_CATALOG, VALIDATION_KEYS } from '@cimi/contract'
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
const registryLeaves = collectLeaves(VALIDATION_KEYS)
const englishValidationLeaves = [
  ...collectLeaves(en.validation.shared, 'shared'),
  ...collectLeaves(en.validation.contract, 'contract'),
]
const frenchValidationLeaves = [
  ...collectLeaves(fr.validation.shared, 'shared'),
  ...collectLeaves(fr.validation.contract, 'contract'),
]
const frenchByPath = new Map(frenchLeaves.map((leaf) => [leaf.path, leaf]))
const englishErrorLeaves = collectLeaves(en.errors)
const frenchErrorLeaves = collectLeaves(fr.errors)
const frenchErrorsByPath = new Map(frenchErrorLeaves.map((leaf) => [leaf.path, leaf]))

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

  it('covers every shared and contract validation registry leaf in both locales', () => {
    const registryPaths = registryLeaves.map(({ path }) => path).sort()

    expect(englishValidationLeaves.map(({ path }) => path).sort()).toEqual(registryPaths)
    expect(frenchValidationLeaves.map(({ path }) => path).sort()).toEqual(registryPaths)
    expect(new Set(registryLeaves.map(({ message }) => message)).size).toBe(registryLeaves.length)
    expect(registryLeaves.every(({ message }) => message.startsWith('validation.'))).toBe(true)

    const localeLeaves = [englishValidationLeaves, frenchValidationLeaves]
    for (const leaves of localeLeaves) {
      for (const { message, path } of leaves) {
        expect(message.trim(), path).not.toBe('')
        expect(interpolationShape(message), path).toEqual([])
      }
    }
  })

  it('covers every contract error code in both locales', () => {
    const catalogPaths = Object.keys(ERROR_CATALOG).sort()

    expect(englishErrorLeaves.map(({ path }) => path).sort()).toEqual(catalogPaths)
    expect(frenchErrorLeaves.map(({ path }) => path).sort()).toEqual(catalogPaths)
  })

  it('keeps the API error key tree aligned', () => {
    expect(frenchErrorLeaves.map(({ path }) => path).sort()).toEqual(
      englishErrorLeaves.map(({ path }) => path).sort(),
    )

    for (const { message, path } of englishErrorLeaves) {
      const frenchLeaf = frenchErrorsByPath.get(path)

      expect(frenchLeaf?.message, path).toBeDefined()
      if (!frenchLeaf) continue

      expect(frenchLeaf.message.trim(), path).not.toBe('')
      expect(interpolationShape(frenchLeaf.message), path).toEqual(interpolationShape(message))
    }
  })
})
