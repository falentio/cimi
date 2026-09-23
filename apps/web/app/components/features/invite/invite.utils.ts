import type { AuthState } from '@/composables/useAuth'

export type InvitationStatus = 'idle' | 'loading' | 'error' | 'accepted'

export type InvitationView = 'loading' | 'signedOut' | 'error' | 'accepted'

export interface InvitationViewInput {
  readonly hydrated: boolean
  readonly sessionStatus: AuthState['status']
  readonly invitationStatus: InvitationStatus
}

/**
 * Picks the branch the invite page renders.
 *
 * The server cannot resolve the auth session: `useAuth` refreshes it in the
 * browser only, and the global middleware short-circuits during SSR. Every
 * server render therefore sees `idle` and takes the signed-out branch. The
 * client resolves the session before hydration, so its first render must reuse
 * that server view instead of its own result. `hydrated` flips once Vue owns
 * the DOM, after which the live statuses decide.
 */
export function invitationViewFor(input: InvitationViewInput): InvitationView {
  const sessionStatus = input.hydrated ? input.sessionStatus : 'idle'
  const invitationStatus = input.hydrated ? input.invitationStatus : 'idle'

  if (sessionStatus === 'loading' || invitationStatus === 'loading') return 'loading'
  if (sessionStatus !== 'authenticated') return 'signedOut'
  if (invitationStatus === 'error') return 'error'
  if (invitationStatus === 'accepted') return 'accepted'

  // Authenticated with an idle invitation: acceptance starts on the next tick.
  return 'loading'
}
