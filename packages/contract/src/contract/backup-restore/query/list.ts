import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SBackup } from '../schema.ts'

export const SBackupListInput = SPaginationInput
export type SBackupListInput = v.InferOutput<typeof SBackupListInput>
export const SBackupListOutput = v.strictObject({
  items: v.array(SBackup),
  nextCursor: v.nullable(SCursor),
})
export type SBackupListOutput = v.InferOutput<typeof SBackupListOutput>

export const listBackups = oc
  .route({ method: 'GET', path: '/listBackups' })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SBackupListInput)
  .output(SBackupListOutput)
