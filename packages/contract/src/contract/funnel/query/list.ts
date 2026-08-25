import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SFunnel, SFunnelSiteFields } from '../schema.ts'

export const SFunnelListInput = v.strictObject(
  v.entriesFromObjects([SFunnelSiteFields, SOffsetPaginationInput]),
)
export type SFunnelListInput = v.InferOutput<typeof SFunnelListInput>
export const SFunnelListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SFunnel) }), SOffsetPage]),
)
export type SFunnelListOutput = v.InferOutput<typeof SFunnelListOutput>

export const listFunnels = oc
  .route({
    method: 'GET',
    path: '/funnel/listFunnels',
    operationId: 'listFunnels',
    summary: 'List funnels',
    description: 'List persisted Funnel definitions visible within the authorized Site scope.',
    tags: ['funnel'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SFunnelListInput)
  .output(SFunnelListOutput)
