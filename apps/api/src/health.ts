import type { CreateApiAppDependencies } from './index.ts'

export async function systemHealthHandler(
  deps: CreateApiAppDependencies,
): Promise<{ status: 'ok'; controlDatabase: boolean; analyticsDatabase: boolean }> {
  let controlDatabase = false
  try {
    const result = deps.db.$client.prepare('select 1').get()
    controlDatabase = Boolean(result)
  } catch {
    controlDatabase = false
  }

  let analyticsDatabase = false
  try {
    analyticsDatabase = await deps.analytics.ready()
  } catch {
    analyticsDatabase = false
  }

  return {
    status: 'ok',
    controlDatabase,
    analyticsDatabase,
  }
}
