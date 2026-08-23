import { initializeInstallation } from './command/initialize.ts'
import { getInstallationStatus } from './query/get-status.ts'

export const installation = { getInstallationStatus, initializeInstallation }
