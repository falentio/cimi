import { defineConfig } from 'vite-plus'

export default defineConfig({
  defaultPackage: 'apps/frontend',
  check: {
    fmt: true,
    lint: true,
  },
  staged: {
    '*.{js,ts,tsx,mjs,cjs,astro}': 'vp check --fix',
  },
  fmt: {
    ignorePatterns: [
      'lomba/**',
      'rybbit/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
    ],
    singleQuote: true,
    semi: false,
  },
  lint: {
    ignorePatterns: [
      'lomba/**',
      'rybbit/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  run: {
    cache: {
      tasks: true,
      scripts: true,
    },
  },
})
