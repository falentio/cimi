import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SMembership, SMembershipOrganizationFields } from '../schema.ts'

export const SMembershipListInput = v.strictObject(
  v.entriesFromObjects([SMembershipOrganizationFields, SOffsetPaginationInput]),
)
export type SMembershipListInput = v.InferOutput<typeof SMembershipListInput>
export const SMembershipListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SMembership) }), SOffsetPage]),
)
export type SMembershipListOutput = v.InferOutput<typeof SMembershipListOutput>

export const listMembers = oc
  .route({
    method: 'GET',
    path: '/listMembers',
    operationId: 'listMembers',
    summary: 'List organization members',
    description: 'List active memberships for an authorized Organization.',
    tags: ['membership'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    INTERNAL_SERVER_ERROR: { status: 500 },
  })
  .input(SMembershipListInput)
  .output(SMembershipListOutput)
