#!/usr/bin/env node

import { createCli } from './index.ts'
import { openBrowser } from './auth/browser.ts'
import { createAuthLogin } from './auth/login.ts'
import { createSystemSecretStore } from './auth/keychain.ts'
import { createTerminalPrompt } from './auth/prompt.ts'
import { createCredentialStore } from './auth/profile.ts'

async function main(): Promise<void> {
  const secretStore = createSystemSecretStore()
  const run = createCli({
    name: 'cimi',
    version: '0.0.1',
    stdout: process.stdout,
    stderr: process.stderr,
    exit(code) {
      process.exitCode = code
    },
    prompt: createTerminalPrompt(),
    authLogin: createAuthLogin({
      fetch,
      store: createCredentialStore(secretStore),
      openUrl: openBrowser,
      sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      now: () => Date.now(),
    }),
  })

  await run(process.argv.slice(2))
}

if (import.meta.main) await main()
