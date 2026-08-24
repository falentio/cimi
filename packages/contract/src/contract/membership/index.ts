import { changeMemberRole } from './command/change-member-role.ts'
import { leaveOrganization } from './command/leave-organization.ts'
import { removeMember } from './command/remove-member.ts'
import { transferOrganizationOwnership } from './command/transfer-ownership.ts'
import { listMembers } from './query/list.ts'

export const membership = {
  listMembers,
  changeMemberRole,
  removeMember,
  leaveOrganization,
  transferOrganizationOwnership,
}
