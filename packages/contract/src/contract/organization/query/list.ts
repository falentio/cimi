import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SOrganization } from '../schema.ts'

export const SOrganizationListInput = SOffsetPaginationInput
export type SOrganizationListInput = v.InferOutput<typeof SOrganizationListInput>
export const SOrganizationListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SOrganization) }), SOffsetPage]),
)
export type SOrganizationListOutput = v.InferOutput<typeof SOrganizationListOutput>

export const listOrganizations = oc
  .route({
    method: 'GET',
    path: '/listOrganizations',
    operationId: 'listOrganizations',
    summary: 'List organizations',
    description: 'List Organizations with persisted membership for the current user.',
    tags: ['organization'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    BAD_REQUEST: { status: 400 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SOrganizationListInput)
  .output(SOrganizationListOutput)
