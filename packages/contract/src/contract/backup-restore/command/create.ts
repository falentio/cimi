import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ECommand } from '../../../schema/index.ts'
import { SBackup } from '../schema.ts'

export const SBackupCreateInput = v.strictObject({})
export type SBackupCreateInput = v.InferOutput<typeof SBackupCreateInput>
export const SBackupCreateOutput = SBackup
export type SBackupCreateOutput = v.InferOutput<typeof SBackupCreateOutput>

export const createBackup = oc
  .route({ method: 'POST', path: '/createBackup' })
  .meta({ auth: 'admin' })
  .errors({ ...ECommand, INSUFFICIENT_STORAGE: {} })
  .input(SBackupCreateInput)
  .output(SBackupCreateOutput)
