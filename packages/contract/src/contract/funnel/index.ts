import { archiveFunnel } from './command/archive.ts'
import { createFunnel } from './command/create.ts'
import { updateFunnel } from './command/update.ts'
import { getFunnel } from './query/get.ts'
import { getFunnelReport } from './query/get-report.ts'
import { listFunnels } from './query/list.ts'

export const funnel = {
  listFunnels,
  getFunnel,
  getFunnelReport,
  createFunnel,
  updateFunnel,
  archiveFunnel,
}
