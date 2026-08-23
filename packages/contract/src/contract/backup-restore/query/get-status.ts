import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SBackup, SBackupIdFields } from '../schema.ts'

export const SBackupStatusInput = SBackupIdFields
export type SBackupStatusInput = v.InferOutput<typeof SBackupStatusInput>
export const SBackupStatusOutput = SBackup
export type SBackupStatusOutput = v.InferOutput<typeof SBackupStatusOutput>

export const getBackupStatus = oc
  .route({ method: 'GET', path: '/getBackupStatus' })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SBackupStatusInput)
  .output(SBackupStatusOutput)
