import { adminApi } from '../../orpc.ts'
import type { BackupRestoreService } from './service.ts'

const backupRestoreApi = adminApi.backupRestore

export function backupRestoreRouter(service: BackupRestoreService) {
  return backupRestoreApi.router({
    listBackups: backupRestoreApi.listBackups.handler(({ input, context }) =>
      service.list(input, context.user),
    ),
    getBackupStatus: backupRestoreApi.getBackupStatus.handler(({ input, context }) =>
      service.getStatus(input, context.user),
    ),
    createBackup: backupRestoreApi.createBackup.handler(({ input, context }) =>
      service.createBackup(input, context.user),
    ),
    restoreBackup: backupRestoreApi.restoreBackup.handler(({ input, context }) =>
      service.restoreBackup(input, context.user),
    ),
  })
}
