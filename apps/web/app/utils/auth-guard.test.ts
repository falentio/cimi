import { describe, expect, it } from 'vitest'
import type { RouteMeta } from 'vue-router'
import {
  ADMIN_ROLE,
  resolveAuthDecision,
  resolvePostAuthDestination,
  toRouteLocation,
  type LocalePath,
} from './auth-guard'

function route(fullPath: string, meta: { auth?: unknown; admin?: unknown; guest?: unknown } = {}) {
  // SAFETY: the caller only sets boolean meta flags; RouteMeta accepts unknown-valued keys.
  return { fullPath, meta: meta as RouteMeta }
}

// Mirrors Nuxt's localePath for strategy prefix_except_default: the default locale
// keeps bare paths, a prefixed locale joins its prefix onto the route path.
function localePathFactory(prefix = ''): LocalePath {
  const resolve = (path: string) => (prefix === '' ? path : `${prefix}${path}`)

  return (path) =>
    path === 'login' ? resolve('/login') : path === 'index' ? resolve('/') : resolve(path)
}

describe('resolveAuthDecision', () => {
  it('passes authenticated sessions through protected routes', () => {
    expect(resolveAuthDecision(route('/'), 'authenticated', 'user')).toBeUndefined()
  })

  it('redirects unauthenticated sessions to login with the return path', () => {
    expect(
      resolveAuthDecision(route('/org/org_1/settings/members'), 'unauthenticated', null),
    ).toEqual({ kind: 'sign-in', returnTo: '/org/org_1/settings/members' })
  })

  it('redirects unknown session states to sign-in', () => {
    for (const status of ['idle', 'loading', 'error'] as const) {
      expect(resolveAuthDecision(route('/sites/ste_1'), status, null)).toEqual({
        kind: 'sign-in',
        returnTo: '/sites/ste_1',
      })
    }
  })

  it('skips the guard when the route opts out of auth', () => {
    expect(
      resolveAuthDecision(route('/login', { auth: false }), 'unauthenticated', null),
    ).toBeUndefined()
  })

  it('passes admin sessions through admin routes', () => {
    expect(
      resolveAuthDecision(route('/admin/retention', { admin: true }), 'authenticated', 'admin'),
    ).toBeUndefined()
  })

  it('passes global admins through setup', () => {
    expect(
      resolveAuthDecision(route('/setup', { admin: true }), 'authenticated', 'admin'),
    ).toBeUndefined()
  })

  it('redirects authenticated global users away from setup', () => {
    expect(resolveAuthDecision(route('/setup', { admin: true }), 'authenticated', 'user')).toEqual({
      kind: 'home',
    })
  })

  it('redirects unauthenticated setup access to sign-in', () => {
    expect(resolveAuthDecision(route('/setup', { admin: true }), 'unauthenticated', null)).toEqual({
      kind: 'sign-in',
      returnTo: '/setup',
    })
  })

  it('redirects non-admin sessions away from admin routes', () => {
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', 'user')).toEqual({
      kind: 'home',
    })
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', null)).toEqual({
      kind: 'home',
    })
    expect(
      resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', undefined),
    ).toEqual({ kind: 'home' })
  })

  it('treats admin routes as protected before the role check', () => {
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'unauthenticated', null)).toEqual({
      kind: 'sign-in',
      returnTo: '/admin',
    })
  })

  it('sends authenticated visitors home from guest-only routes', () => {
    expect(resolveAuthDecision(route('/login', { guest: true }), 'authenticated', 'user')).toEqual({
      kind: 'home',
    })
    expect(
      resolveAuthDecision(route('/signup', { guest: true }), 'authenticated', 'admin'),
    ).toEqual({
      kind: 'home',
    })
  })

  it('lets anonymous visitors onto guest-only routes', () => {
    expect(
      resolveAuthDecision(route('/login', { guest: true }), 'unauthenticated', null),
    ).toBeUndefined()
  })

  it('honours the admin role constant', () => {
    expect(ADMIN_ROLE).toBe('admin')
  })
})

describe('resolvePostAuthDestination', () => {
  it('returns an absolute same-origin redirect target', () => {
    expect(resolvePostAuthDestination('/org/org_1/settings/members')).toEqual({
      kind: 'path',
      path: '/org/org_1/settings/members',
    })
    expect(resolvePostAuthDestination('/fr/sites/ste_1?tab=events')).toEqual({
      kind: 'path',
      path: '/fr/sites/ste_1?tab=events',
    })
  })

  it('falls back to home when the redirect is absent', () => {
    expect(resolvePostAuthDestination(undefined)).toEqual({ kind: 'home' })
  })

  it('falls back to home when the redirect is not a string', () => {
    expect(resolvePostAuthDestination(null)).toEqual({ kind: 'home' })
    expect(resolvePostAuthDestination(['/x'])).toEqual({ kind: 'home' })
    expect(resolvePostAuthDestination([null])).toEqual({ kind: 'home' })
  })

  it('falls back to home for relative redirects', () => {
    expect(resolvePostAuthDestination('org/org_1')).toEqual({ kind: 'home' })
    expect(resolvePostAuthDestination('')).toEqual({ kind: 'home' })
  })

  it('rejects protocol-relative redirects to other origins', () => {
    expect(resolvePostAuthDestination('//evil.example')).toEqual({ kind: 'home' })
    expect(resolvePostAuthDestination('//evil.example/x')).toEqual({ kind: 'home' })
  })

  it('never produces a redirect that re-enters an auth page', () => {
    for (const target of ['/login', '/signup', '/login?redirect=/x']) {
      expect(resolvePostAuthDestination(target)).not.toEqual({ kind: 'path', path: target })
    }
  })
})

describe('toRouteLocation', () => {
  it('returns undefined when there is no decision', () => {
    expect(toRouteLocation(undefined, localePathFactory())).toBeUndefined()
  })

  it('maps sign-in to the localized login route with the return path', () => {
    expect(
      toRouteLocation({ kind: 'sign-in', returnTo: '/settings/account' }, localePathFactory('/fr')),
    ).toEqual({ path: '/fr/login', query: { redirect: '/settings/account' } })
  })

  it('maps home to the localized index route', () => {
    expect(toRouteLocation({ kind: 'home' }, localePathFactory('/fr'))).toEqual({ path: '/fr/' })
    expect(toRouteLocation({ kind: 'home' }, localePathFactory())).toEqual({ path: '/' })
  })

  it('passes an absolute path through unchanged', () => {
    expect(
      toRouteLocation({ kind: 'path', path: '/org/org_1/home' }, localePathFactory('/fr')),
    ).toEqual({ path: '/org/org_1/home' })
  })
})
