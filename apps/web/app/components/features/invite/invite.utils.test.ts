import { describe, expect, it } from 'vitest'
import {
  invitationRenderFor,
  type InvitationStatus,
  type InvitationView,
  type InvitationViewInput,
} from './invite.utils'
import type { AuthState } from '@/composables/useAuth'

const sessionStatuses: readonly AuthState['status'][] = [
  'idle',
  'loading',
  'authenticated',
  'unauthenticated',
  'error',
]
const invitationStatuses: readonly InvitationStatus[] = ['idle', 'loading', 'error', 'accepted']

function everyCombination(hydrated: boolean): InvitationViewInput[] {
  return sessionStatuses.flatMap((sessionStatus) =>
    invitationStatuses.map((invitationStatus) => ({
      hydrated,
      sessionStatus,
      invitationStatus,
    })),
  )
}

describe('invitationRenderFor', () => {
  it('keeps the first client render identical to the server render', () => {
    const views = new Set<InvitationView>()

    for (const input of everyCombination(false)) {
      views.add(invitationRenderFor(input).view)
    }

    expect([...views]).toEqual(['signedOut'])
  })

  it('renders the signed-out branch for every status a server render can produce', () => {
    for (const input of everyCombination(false)) {
      expect(
        invitationRenderFor(input).view,
        `${input.sessionStatus}/${input.invitationStatus}`,
      ).toBe('signedOut')
    }
  })

  it('spins until the session resolves after hydration', () => {
    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'idle',
        invitationStatus: 'idle',
      }).view,
    ).toBe('loading')

    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'idle',
      }).view,
    ).toBe('loading')
  })

  it('reports loading while the session or the acceptance is in flight', () => {
    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'loading',
        invitationStatus: 'idle',
      }).view,
    ).toBe('loading')

    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'loading',
      }).view,
    ).toBe('loading')
  })

  it('reports the acceptance outcome for an authenticated session', () => {
    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'error',
      }).view,
    ).toBe('error')

    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'accepted',
      }).view,
    ).toBe('accepted')
  })

  it('signs the visitor out when the session is unauthenticated or errored', () => {
    for (const sessionStatus of ['unauthenticated', 'error'] as const) {
      for (const invitationStatus of invitationStatuses) {
        expect(
          invitationRenderFor({ hydrated: true, sessionStatus, invitationStatus }).view,
          `${sessionStatus}/${invitationStatus}`,
        ).toBe('signedOut')
      }
    }
  })

  it('labels the loading line from the same status as the branch', () => {
    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'loading',
        invitationStatus: 'idle',
      }).loadingMessageKey,
    ).toBe('invite.checkingSession')

    expect(
      invitationRenderFor({
        hydrated: true,
        sessionStatus: 'authenticated',
        invitationStatus: 'idle',
      }).loadingMessageKey,
    ).toBe('invite.accepting')
  })
})
