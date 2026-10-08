import { ControlDatabaseBusyError } from '@cimi/db'

export class BackupIncompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupIncompatibilityError'
  }
}

export class ControlDatabaseBusyBackupError extends Error {
  constructor(cause: unknown) {
    super(
      cause instanceof ControlDatabaseBusyError
        ? cause.message
        : 'The control database could not be checkpointed',
    )
    this.name = 'ControlDatabaseBusyBackupError'
  }
}
