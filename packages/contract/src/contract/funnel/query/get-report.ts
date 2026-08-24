import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SId, SReportFieldsSchema, isValidReportRange } from '../../../schema/index.ts'
import { SFunnelReport } from '../schema.ts'

export const SFunnelReportInput = v.pipe(
  v.strictObject(v.entriesFromObjects([v.strictObject({ funnelId: SId }), SReportFieldsSchema])),
  v.check((input) => isValidReportRange(input), 'Report date ranges must be ordered.'),
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
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
    QUERY_LIMIT_EXCEEDED: { status: 422 },
    SERVICE_UNAVAILABLE: { status: 503 },
  })
  .input(SFunnelReportInput)
  .output(SFunnelReportOutput)
