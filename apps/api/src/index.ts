import { createApiComposition, type CreateApiAppDependencies } from './composition.ts'
import { createApiHttpApp, type ApiApp } from './http-app.ts'

export { createApiHttpApp } from './http-app.ts'
export { normalizeApiError } from './errors.ts'
export {
  createSiteLifecycleWorker,
  SiteLifecycleWorker,
  type CreateSiteLifecycleWorkerDependencies,
  type SiteLifecycleWorkerDependencies,
} from './resources/site/index.ts'
export type { ApiComposition, ApiRouter, CreateApiAppDependencies } from './composition.ts'
export type { ApiApp } from './http-app.ts'

export function createApiApp(deps: CreateApiAppDependencies): ApiApp {
  return createApiHttpApp(deps, createApiComposition(deps))
}
