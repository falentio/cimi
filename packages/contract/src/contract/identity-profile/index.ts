import { identify } from './command/identify.ts'
import { requestProfileDeletion } from './command/request-profile-deletion.ts'
import { getDeletionStatus } from './query/get-deletion-status.ts'
import { getProfile } from './query/get.ts'
import { listProfiles } from './query/list.ts'

export const identityProfile = {
  listProfiles,
  getProfile,
  getDeletionStatus,
  identify,
  requestProfileDeletion,
}
