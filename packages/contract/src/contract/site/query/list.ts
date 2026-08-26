import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SSite, SSiteOrganizationScopeFields } from '../schema.ts'

export const SSiteListInput = v.strictObject(
  v.entriesFromObjects([SSiteOrganizationScopeFields, SOffsetPaginationInput]),
)
export type SSiteListInput = v.InferOutput<typeof SSiteListInput>
export const SSiteListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SSite) }), SOffsetPage]),
)
export type SSiteListOutput = v.InferOutput<typeof SSiteListOutput>

export const listSites = oc
  .route({
    method: 'GET',
    path: '/site/listSites',
    operationId: 'listSites',
    summary: 'List sites',
    description:
      'List Sites visible through persisted Organization membership using live offset pages.',
    tags: ['site'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: {},
    BAD_REQUEST: {},
    INTERNAL_SERVER_ERROR: {},
  })
  .input(SSiteListInput)
  .output(SSiteListOutput)
