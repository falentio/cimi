import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SId, SQueryInput } from '../../../schema/index.ts'
import { SFunnelReport } from '../schema.ts'

export const SFunnelReportInput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ funnelId: SId }), SQueryInput]),
)
export const SFunnelReportOutput = SFunnelReport
export type SFunnelReportInput = v.InferOutput<typeof SFunnelReportInput>
export type SFunnelReportOutput = v.InferOutput<typeof SFunnelReportOutput>

export const getFunnelReport = oc
  .route({
    method: 'GET',
    path: '/getFunnelReport',
    operationId: 'getFunnelReport',
    summary: 'Get a funnel report',
    description: 'Report ordered same-Session conversion steps for a bounded period.',
    tags: ['funnel'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SFunnelReportInput)
  .output(SFunnelReportOutput)
