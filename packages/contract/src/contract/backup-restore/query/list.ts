import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SBackup } from '../schema.ts'

export const SBackupListInput = SOffsetPaginationInput
export type SBackupListInput = v.InferOutput<typeof SBackupListInput>
export const SBackupListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SBackup) }), SOffsetPage]),
)
export type SBackupListOutput = v.InferOutput<typeof SBackupListOutput>

export const listBackups = oc
  .route({
    method: 'GET',
    path: '/backup-restore/listBackups',
    operationId: 'listBackups',
    summary: 'List backups',
    description: 'List configured backup manifests and their current statuses.',
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
  .input(SBackupListInput)
  .output(SBackupListOutput)
