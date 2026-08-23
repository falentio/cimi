import { acceptInvitation } from './command/accept.ts'
import { createInvitation } from './command/create.ts'
import { revokeInvitation } from './command/revoke.ts'
import { listInvitations } from './query/list.ts'

export const invitation = { listInvitations, createInvitation, revokeInvitation, acceptInvitation }
