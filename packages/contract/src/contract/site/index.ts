import { createSite } from './command/create.ts'
import { deleteSite } from './command/delete.ts'
import { rotateIngestionIdentifier } from './command/rotate-ingestion-identifier.ts'
import { updateSite } from './command/update.ts'
import { updateSiteV2 } from './command/update-v2.ts'
import { getSite } from './query/get.ts'
import { listSites } from './query/list.ts'

export const site = {
  listSites,
  getSite,
  createSite,
  updateSite,
  updateSiteV2,
  deleteSite,
  rotateIngestionIdentifier,
}
