import { api, authenticatedApi } from '../../orpc.ts'
import type { InstallationService } from './service.ts'

const installationApi = api.installation
const authenticatedInstallationApi = authenticatedApi.installation

export function installationRouter(service: InstallationService) {
  return installationApi.router({
    getInstallationStatus: authenticatedInstallationApi.getInstallationStatus.handler(
      ({ context }) => service.getStatus(context.user),
    ),
    initializeInstallation: authenticatedInstallationApi.initializeInstallation.handler(
      ({ input, context }) => service.initialize(input, context.user),
    ),
    upgradeInstallation: authenticatedInstallationApi.upgradeInstallation.handler(
      ({ input, context }) => service.upgrade(input, context.user),
    ),
  })
}
