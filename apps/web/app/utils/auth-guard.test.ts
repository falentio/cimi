import { describe, expect, it } from 'vitest'
import { resolveAuthDecision } from './auth-guard'

function route(fullPath: string, meta: Record<string, unknown> = {}) {
  return { fullPath, meta }
}

describe('resolveAuthDecision', () => {
  it('passes authenticated sessions through protected routes', () => {
    expect(resolveAuthDecision(route('/'), 'authenticated', 'user')).toBeUndefined()
  })

  it('redirects unauthenticated sessions to login with the return path', () => {
    expect(resolveAuthDecision(route('/settings/members'), 'unauthenticated', null)).toEqual({
      path: '/login',
      query: { redirect: '/settings/members' },
    })
  })

  it('redirects unknown session states to login', () => {
    for (const status of ['idle', 'loading', 'error'] as const) {
      expect(resolveAuthDecision(route('/sites/ste_1'), status, null)).toEqual({
        path: '/login',
        query: { redirect: '/sites/ste_1' },
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

  it('redirects non-admin sessions away from admin routes without a return path', () => {
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', 'user')).toEqual({
      path: '/',
    })
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', null)).toEqual({
      path: '/',
    })
    expect(
      resolveAuthDecision(route('/admin', { admin: true }), 'authenticated', undefined),
    ).toEqual({ path: '/' })
  })

  it('treats admin routes as protected before the role check', () => {
    expect(resolveAuthDecision(route('/admin', { admin: true }), 'unauthenticated', null)).toEqual({
      path: '/login',
      query: { redirect: '/admin' },
    })
  })
})
