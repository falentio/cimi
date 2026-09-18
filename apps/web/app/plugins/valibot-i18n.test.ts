import { describe, expect, it, vi } from 'vitest'

describe('Valibot i18n plugin', () => {
  it('loads the registration module through Nuxt plugin discovery', async () => {
    const defineNuxtPlugin = vi.fn((plugin: unknown) => plugin)
    vi.stubGlobal('defineNuxtPlugin', defineNuxtPlugin)

    const module = await import('./valibot-i18n')

    expect(defineNuxtPlugin).toHaveBeenCalledOnce()
    expect(module.default).toBeDefined()
  })
})
