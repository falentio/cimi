import { adminApi, api } from '../../orpc.ts'
import type { InstallationService } from './service.ts'

const installationApi = api.installation
const adminInstallationApi = adminApi.installation

export function installationRouter(service: InstallationService) {
  return installationApi.router({
    getInstallationStatus: adminInstallationApi.getInstallationStatus.handler(({ context }) =>
      service.getStatus(context.user),
    ),
    initializeInstallation: adminInstallationApi.initializeInstallation.handler(
      ({ input, context }) => service.initialize(input, context.user),
    ),
    upgradeInstallation: adminInstallationApi.upgradeInstallation.handler(({ input, context }) =>
      service.upgrade(input, context.user),
    ),
  })
}
