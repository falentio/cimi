import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { ERead, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SMembership, SMembershipOrganizationFields } from '../schema.ts'

export const SMembershipListInput = v.strictObject(
  v.entriesFromObjects([SMembershipOrganizationFields, SPaginationInput]),
)
export type SMembershipListInput = v.InferOutput<typeof SMembershipListInput>
export const SMembershipListOutput = v.strictObject({
  items: v.array(SMembership),
  nextCursor: v.nullable(SCursor),
})
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
  .errors(ERead)
  .input(SMembershipListInput)
  .output(SMembershipListOutput)
