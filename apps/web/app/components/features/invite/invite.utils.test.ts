import { describe, expect, it } from 'vitest'
import { invitationViewFor, type InvitationStatus } from './invite.utils'
import type { AuthState } from '@/composables/useAuth'

const sessionStatuses: readonly AuthState['status'][] = [
  'idle',
  'loading',
  'authenticated',
  'unauthenticated',
  'error',
]
const invitationStatuses: readonly InvitationStatus[] = ['idle', 'loading', 'error', 'accepted']

describe('invitationViewFor', () => {
  it('renders the signed-out branch for every status a server render can produce', () => {
    for (const sessionStatus of sessionStatuses) {
      for (const invitationStatus of invitationStatuses) {
        expect(
          invitationViewFor({ hydrated: false, sessionStatus, invitationStatus }),
          `${sessionStatus}/${invitationStatus}`,
        ).toBe('signedOut')
      }
    }
  })

  it('keeps the first client render identical to the server render', () => {
    const serverView = invitationViewFor({
      hydrated: false,
      sessionStatus: 'idle',
      invitationStatus: 'idle',
    })

    for (const sessionStatus of sessionStatuses) {
      for (const invitationStatus of invitationStatuses) {
        expect(
          invitationViewFor({ hydrated: false, sessionStatus, invitationStatus }),
          `${sessionStatus}/${invitationStatus}`,
        ).toBe(serverView)
      }
    }
  })

  it('waits to accept until the session resolves after hydration', () => {
    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'idle',
      }),
    ).toBe('loading')

    expect(
      invitationViewFor({ hydrated: true, sessionStatus: 'idle', invitationStatus: 'idle' }),
    ).toBe('signedOut')
  })

  it('reports loading while the session or the acceptance is in flight', () => {
    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'loading',
        invitationStatus: 'idle',
      }),
    ).toBe('loading')

    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'loading',
      }),
    ).toBe('loading')
  })

  it('reports the acceptance outcome for an authenticated session', () => {
    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'error',
      }),
    ).toBe('error')

    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'accepted',
      }),
    ).toBe('accepted')
  })

  it('keeps a signed-out visitor signed out even when the invitation errored', () => {
    expect(
      invitationViewFor({
        hydrated: true,
        sessionStatus: 'unauthenticated',
        invitationStatus: 'error',
      }),
    ).toBe('signedOut')
  })
})
