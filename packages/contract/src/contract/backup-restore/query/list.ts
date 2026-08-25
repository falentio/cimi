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
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SBackupListInput)
  .output(SBackupListOutput)
