import type { RouteMeta } from 'vue-router'
import type { AuthState } from '@/composables/useAuth'
import { isStringValue } from './type-guards'

export interface AuthRouteLike {
  readonly fullPath: string
  readonly meta: RouteMeta
}

/**
 * A locale-agnostic navigation intent. toRouteLocation is the only place these
 * meet a route name, so nothing downstream re-derives which page is the login page.
 */
export type AuthDestination =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'sign-in'; readonly returnTo: string }
  | { readonly kind: 'home' }

export type AuthDecision = AuthDestination | undefined

/**
 * Whatever a URL query can carry for the redirect param: vue-router types
 * route.query as string | null | readonly (string | null)[]. This is the
 * untrusted side of the boundary; resolvePostAuthDestination decodes it.
 */
export type RedirectQueryValue = string | null | undefined | readonly (string | null)[]

/** A completed authentication never sends the user to sign-in again. */
export type PostAuthDestination = Extract<AuthDestination, { kind: 'path' | 'home' }>

export type LocalePath = (path: string) => string

export interface AuthRedirect {
  readonly path: string
  readonly query?: Record<string, string>
}

export const ADMIN_ROLE = 'admin'

const AUTH_PAGE_PATHS = ['/login', '/signup'] as const

export function resolveAuthDecision(
  to: AuthRouteLike,
  sessionStatus: AuthState['status'],
  userRole: string | null | undefined,
): AuthDecision {
  if (to.meta.auth === false) return undefined

  if (to.meta.guest === true) {
    return sessionStatus === 'authenticated' ? { kind: 'home' } : undefined
  }

  if (sessionStatus !== 'authenticated') {
    return { kind: 'sign-in', returnTo: to.fullPath }
  }

  if (to.meta.admin === true && userRole !== ADMIN_ROLE) return { kind: 'home' }

  return undefined
}

/**
 * Turns an untrusted redirect query value into a destination. An absolute
 * same-origin path survives; every other shape, including an auth page,
 * collapses to home so a sign-in can never re-enter the sign-in flow.
 */
export function resolvePostAuthDestination(rawRedirect: RedirectQueryValue): PostAuthDestination {
  if (!isStringValue(rawRedirect)) return { kind: 'home' }

  if (!rawRedirect.startsWith('/') || rawRedirect.startsWith('//')) return { kind: 'home' }

  if (isAuthPagePath(rawRedirect)) return { kind: 'home' }

  return { kind: 'path', path: rawRedirect }
}

export function toRouteLocation(
  decision: AuthDecision,
  localePath: LocalePath,
): AuthRedirect | undefined {
  if (decision === undefined) return undefined

  switch (decision.kind) {
    case 'sign-in':
      return { path: localePath('login'), query: { redirect: decision.returnTo } }
    case 'home':
      return { path: localePath('index') }
    case 'path':
      return { path: decision.path }
  }
}

function isAuthPagePath(path: string): boolean {
  return AUTH_PAGE_PATHS.some((authPage) => path === authPage || path.startsWith(authPage + '?'))
}
