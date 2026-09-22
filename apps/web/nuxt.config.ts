import { resolve } from 'node:path'
import { loadLoggingConfig } from '@cimi/config/logging'
import tailwindcss from '@tailwindcss/vite'
import type { ViteOptions } from 'nuxt/schema'

// Nuxt and Tailwind resolve separate vite-plus-core instances, so their Plugin types differ.
const tailwindPlugins = tailwindcss() as NonNullable<ViteOptions['plugins']>

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/tailwind.css'],
  runtimeConfig: {
    public: {
      logging: loadLoggingConfig(),
    },
  },

  vite: {
    plugins: tailwindPlugins,
    resolve: {
      dedupe: ['valibot'],
    },
  },

  modules: ['@pinia/nuxt', '@pinia/colada-nuxt', 'shadcn-nuxt', '@nuxtjs/i18n'],
  i18n: {
    vueI18n: './i18n.config.ts',
    strategy: 'prefix_except_default',
    defaultLocale: 'en',
    detectBrowserLanguage: false,
    baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    locales: [
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
    ],
  },
  nitro: {
    preset: 'node-server',
    esbuild: {
      options: {
        target: 'es2020',
      },
    },
    serverAssets: [
      {
        baseName: 'control-migrations',
        dir: resolve(import.meta.dirname, '../../packages/db/src/migrations'),
      },
    ],
  },
  shadcn: {
    /**
     * Prefix for all the imported component.
     * @default "Ui"
     */
    prefix: 'UI',
    /**
     * Directory that the component lives in.
     * Will respect the Nuxt aliases.
     * @link https://nuxt.com/docs/api/nuxt-config#alias
     * @default "@/components/ui"
     */
    componentDir: '@/components/ui',
  },
})
