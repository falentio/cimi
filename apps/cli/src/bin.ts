#!/usr/bin/env node

import { createCli } from './index.ts'

async function main(): Promise<void> {
  const run = createCli({
    name: 'cimi',
    version: '0.0.1',
    stdout: process.stdout,
    stderr: process.stderr,
    exit(code) {
      process.exitCode = code
    },
  })

  await run(process.argv.slice(2))
}

if (import.meta.main) await main()
