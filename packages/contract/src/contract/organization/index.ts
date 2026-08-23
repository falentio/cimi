import { createOrganization } from './command/create.ts'
import { deleteOrganization } from './command/delete.ts'
import { ensurePersonalOrganization } from './command/ensure-personal-organization.ts'
import { updateOrganization } from './command/update.ts'
import { getOrganization } from './query/get.ts'
import { listOrganizations } from './query/list.ts'

export const organization = {
  listOrganizations,
  getOrganization,
  ensurePersonalOrganization,
  createOrganization,
  updateOrganization,
  deleteOrganization,
}
