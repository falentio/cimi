import { api, authenticatedApi } from '../../orpc.ts'
import type { MembershipService } from './service.ts'

const membershipApi = api.membership
const authenticatedMembershipApi = authenticatedApi.membership

export function membershipRouter(service: MembershipService) {
  return membershipApi.router({
    listMembers: authenticatedMembershipApi.listMembers.handler(({ input, context }) =>
      service.list(input, context.user, context.headers),
    ),
    changeMemberRole: authenticatedMembershipApi.changeMemberRole.handler(({ input, context }) =>
      service.changeRole(input, context.user, context.headers),
    ),
    removeMember: authenticatedMembershipApi.removeMember.handler(({ input, context }) =>
      service.remove(input, context.user, context.headers),
    ),
    leaveOrganization: authenticatedMembershipApi.leaveOrganization.handler(({ input, context }) =>
      service.leave(input, context.user, context.headers),
    ),
    transferOrganizationOwnership: authenticatedMembershipApi.transferOrganizationOwnership.handler(
      ({ input, context }) => service.transferOwnership(input, context.user, context.headers),
    ),
  })
}
