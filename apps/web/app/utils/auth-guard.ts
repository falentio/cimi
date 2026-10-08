import type { RouteMeta } from 'vue-router'
import type { AuthState } from '@/composables/useAuth'

export interface AuthRouteLike {
  readonly fullPath: string
  readonly meta: RouteMeta
}

export interface AuthRedirect {
  readonly path: string
  readonly query?: Record<string, string>
}

export type AuthDecision = AuthRedirect | undefined

export const ADMIN_ROLE = 'admin'

export function resolveAuthDecision(
  to: AuthRouteLike,
  sessionStatus: AuthState['status'],
  userRole: string | null | undefined,
): AuthDecision {
  if (to.meta.auth === false) return undefined

  if (sessionStatus !== 'authenticated') {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.meta.admin === true && userRole !== ADMIN_ROLE) {
    return { path: '/' }
  }

  return undefined
}
