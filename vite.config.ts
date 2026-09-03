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
      'docs/vendor/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
      'packages/db/src/schema/auth.generated.ts',
      'packages/db/src/migrations/meta/**',
    ],
    singleQuote: true,
    semi: false,
  },
  lint: {
    ignorePatterns: [
      'rybbit/**',
      'docs/vendor/**',
      'node_modules/**',
      'dist/**',
      '.astro/**',
      '.cimi/**',
      'packages/db/src/schema/auth.generated.ts',
      'packages/db/src/migrations/meta/**',
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
