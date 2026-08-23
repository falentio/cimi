import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead } from '../../../schema/index.ts'
import { SBackup, SBackupIdFields } from '../schema.ts'

export const SBackupStatusInput = SBackupIdFields
export type SBackupStatusInput = v.InferOutput<typeof SBackupStatusInput>
export const SBackupStatusOutput = SBackup
export type SBackupStatusOutput = v.InferOutput<typeof SBackupStatusOutput>

export const getBackupStatus = oc
  .route({
    method: 'GET',
    path: '/getBackupStatus',
    operationId: 'getBackupStatus',
    summary: 'Get backup status',
    description: 'Poll backup creation or restore progress for an operator recovery operation.',
    tags: ['backup-restore'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors(ERead)
  .input(SBackupStatusInput)
  .output(SBackupStatusOutput)
