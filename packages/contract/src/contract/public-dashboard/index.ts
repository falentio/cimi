import { disablePublicDashboard } from './command/disable.ts'
import { enablePublicDashboard } from './command/enable.ts'
import { rotatePublicDashboardIdentifier } from './command/rotate-identifier.ts'
import { getPublicDashboardConfig } from './query/get-config.ts'
import { queryPublicDashboard } from './query/query.ts'

export const publicDashboard = {
  getPublicDashboardConfig,
  queryPublicDashboard,
  enablePublicDashboard,
  disablePublicDashboard,
  rotatePublicDashboardIdentifier,
}
