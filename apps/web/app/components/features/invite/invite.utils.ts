import type { AuthState } from '@/composables/useAuth'

export type InvitationStatus = 'idle' | 'loading' | 'error' | 'accepted'

export type InvitationView = 'loading' | 'signedOut' | 'error' | 'accepted'

export type InvitationLoadingMessageKey = 'invite.checkingSession' | 'invite.accepting'

export interface InvitationViewInput {
  readonly hydrated: boolean
  readonly sessionStatus: AuthState['status']
  readonly invitationStatus: InvitationStatus
}

export interface InvitationRender {
  readonly view: InvitationView
  readonly loadingMessageKey: InvitationLoadingMessageKey
}

/**
 * Picks the branch the invite page renders, and the copy for its loading line.
 *
 * The server cannot resolve the auth session: `useAuth` refreshes it in the
 * browser only, and the global middleware short-circuits during SSR. Every
 * server render therefore sees `idle` and renders the signed-out branch. The
 * client resolves the session before hydration, so its first render must reuse
 * that server view instead of its own result. Until `hydrated` flips in
 * `onMounted`, the signed-out view is returned for every input.
 *
 * The loading label is returned here rather than read from the session in the
 * template, so the copy follows the same coerced status as the branch.
 */
export function invitationRenderFor(input: InvitationViewInput): InvitationRender {
  if (!input.hydrated) {
    return { view: 'signedOut', loadingMessageKey: 'invite.checkingSession' }
  }

  const loadingMessageKey: InvitationLoadingMessageKey =
    input.sessionStatus === 'loading' ? 'invite.checkingSession' : 'invite.accepting'

  // An unresolved session spins rather than offering a sign-in that the
  // refresh may already be about to satisfy.
  if (input.sessionStatus === 'loading' || input.sessionStatus === 'idle') {
    return { view: 'loading', loadingMessageKey }
  }

  // The session decides the top-level branch; acceptance only starts once it
  // resolves, so an unauthenticated visitor is never kept on a spinner.
  if (input.sessionStatus !== 'authenticated') return { view: 'signedOut', loadingMessageKey }

  if (input.invitationStatus === 'loading') return { view: 'loading', loadingMessageKey }

  if (input.invitationStatus === 'error') return { view: 'error', loadingMessageKey }

  if (input.invitationStatus === 'accepted') return { view: 'accepted', loadingMessageKey }

  // Authenticated with an idle invitation: acceptance starts on the next tick.
  return { view: 'loading', loadingMessageKey }
}
