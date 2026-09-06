export class BackupIncompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupIncompatibilityError'
  }
}
