import { api, authenticatedApi } from '../../orpc.ts'
import type { InvitationService } from './service.ts'

const invitationApi = api.invitation
const authenticatedInvitationApi = authenticatedApi.invitation

export function invitationRouter(service: InvitationService) {
  return invitationApi.router({
    listInvitations: authenticatedInvitationApi.listInvitations.handler(({ input, context }) =>
      service.list(input, context.user, context.headers),
    ),
    createInvitation: authenticatedInvitationApi.createInvitation.handler(({ input, context }) =>
      service.create(input, context.user, context.headers),
    ),
    revokeInvitation: authenticatedInvitationApi.revokeInvitation.handler(({ input, context }) =>
      service.revoke(input, context.user, context.headers),
    ),
    acceptInvitation: authenticatedInvitationApi.acceptInvitation.handler(({ input, context }) =>
      service.accept(input, context.user, context.headers),
    ),
  })
}
