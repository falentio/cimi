import { createSite } from './command/create.ts'
import { deleteSite } from './command/delete.ts'
import { recoverSite } from './command/recover.ts'
import { rotateIngestionIdentifier } from './command/rotate-ingestion-identifier.ts'
import { updateSiteV2 } from './command/update-v2.ts'
import { getSiteDeletionStatus } from './query/get-deletion-status.ts'
import { getSite } from './query/get.ts'
import { listSites } from './query/list.ts'

export const site = {
  listSites,
  getSite,
  getSiteDeletionStatus,
  createSite,
  updateSiteV2,
  deleteSite,
  recoverSite,
  rotateIngestionIdentifier,
}
