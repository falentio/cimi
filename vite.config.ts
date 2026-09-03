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
      'rybbit/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
      'packages/db/src/schema/auth.generated.ts',
    ],
    singleQuote: true,
    semi: false,
  },
  lint: {
    ignorePatterns: [
      'rybbit/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
      'packages/db/src/schema/auth.generated.ts',
    ],
    overrides: [
      {
        files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
        rules: {
          'typescript/unbound-method': 'off',
        },
      },
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
