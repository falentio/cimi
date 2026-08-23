import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SOrganization } from '../schema.ts'

export const SOrganizationListInput = SPaginationInput
export type SOrganizationListInput = v.InferOutput<typeof SOrganizationListInput>
export const SOrganizationListOutput = v.strictObject({
  items: v.array(SOrganization),
  nextCursor: v.nullable(SCursor),
})
export type SOrganizationListOutput = v.InferOutput<typeof SOrganizationListOutput>

export const listOrganizations = oc
  .route({ method: 'GET', path: '/listOrganizations' })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    BAD_REQUEST: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SOrganizationListInput)
  .output(SOrganizationListOutput)
