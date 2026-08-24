import { initializeInstallation } from './command/initialize.ts'
import { upgradeInstallation } from './command/upgrade.ts'
import { getInstallationStatus } from './query/get-status.ts'

export const installation = { getInstallationStatus, initializeInstallation, upgradeInstallation }
