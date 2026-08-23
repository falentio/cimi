import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SFunnel, SFunnelSiteFields } from '../schema.ts'

export const SFunnelListInput = v.strictObject(
  v.entriesFromObjects([SFunnelSiteFields, SPaginationInput]),
)
export type SFunnelListInput = v.InferOutput<typeof SFunnelListInput>
export const SFunnelListOutput = v.strictObject({
  items: v.array(SFunnel),
  nextCursor: v.nullable(SCursor),
})
export type SFunnelListOutput = v.InferOutput<typeof SFunnelListOutput>

export const listFunnels = oc
  .route({
    method: 'GET',
    path: '/listFunnels',
    operationId: 'listFunnels',
    summary: 'List funnels',
    description: 'List persisted Funnel definitions visible within the authorized Site scope.',
    tags: ['funnel'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SFunnelListInput)
  .output(SFunnelListOutput)
