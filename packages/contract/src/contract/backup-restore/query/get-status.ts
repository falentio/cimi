import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SBackup, SBackupIdFields } from '../schema.ts'

export const SBackupStatusInput = SBackupIdFields
export type SBackupStatusInput = v.InferOutput<typeof SBackupStatusInput>
export const SBackupStatusOutput = SBackup
export type SBackupStatusOutput = v.InferOutput<typeof SBackupStatusOutput>

export const getBackupStatus = oc
  .route({
    method: 'GET',
    path: '/backup-restore/getBackupStatus',
    operationId: 'getBackupStatus',
    summary: 'Get backup status',
    description:
      'Poll progress, SQLite checkpoint, readiness, and independent cleanup stages for an operator recovery operation.',
    tags: ['backup-restore'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SBackupStatusInput)
  .output(SBackupStatusOutput)
