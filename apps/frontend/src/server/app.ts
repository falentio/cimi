import { createApiServerApp, type ApiServerApp } from '@cimi/api/server'
import { createSingleton } from '@cimi/utils'

export type FrontendServerApp = ApiServerApp

export async function createFrontendServerApp(
  env: Record<string, string | undefined> = process.env,
): Promise<FrontendServerApp> {
  return createApiServerApp({ env })
}

const getApp = createSingleton(() => createFrontendServerApp(process.env))
let shutdownHooksInstalled = false
let shutdownPromise: Promise<void> | undefined

export function getApiApp(): Promise<FrontendServerApp> {
  installShutdownHooks()
  return getApp()
}

function installShutdownHooks(): void {
  if (shutdownHooksInstalled) return
  shutdownHooksInstalled = true

  const handleShutdown = (signal: 'SIGINT' | 'SIGTERM'): void => {
    if (shutdownPromise) return

    shutdownPromise = getApp()
      .then((app) => app.close())
      .catch((error: unknown) => {
        console.error(`Failed to close Cimi resources during ${signal}:`, error)
        process.exitCode = 1
      })
      .finally(() => {
        process.removeListener('SIGINT', onSigint)
        process.removeListener('SIGTERM', onSigterm)
        if (process.exitCode === undefined) process.exitCode = signal === 'SIGINT' ? 130 : 143
        process.kill(process.pid, signal)
      })
  }
  const onSigint = () => handleShutdown('SIGINT')
  const onSigterm = () => handleShutdown('SIGTERM')

  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)
}
