import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
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
    cache: true,
  },
})
