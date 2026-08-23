import { createBackup } from './command/create.ts'
import { restoreBackup } from './command/restore.ts'
import { getBackupStatus } from './query/get-status.ts'
import { listBackups } from './query/list.ts'

export const backupRestore = { listBackups, getBackupStatus, createBackup, restoreBackup }
