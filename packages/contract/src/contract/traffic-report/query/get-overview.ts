import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import {
  EQuery,
  SGranularReportFieldsSchema,
  isValidGranularReportRange,
} from '../../../schema/index.ts'
import { STrafficOverview, STrafficSiteFields } from '../schema.ts'

export const STrafficOverviewInput = v.pipe(
  v.strictObject(v.entriesFromObjects([STrafficSiteFields, SGranularReportFieldsSchema])),
  v.check(
    (input) => isValidGranularReportRange(input),
    'Report range is invalid for its granularity.',
  ),
)
export type STrafficOverviewInput = v.InferOutput<typeof STrafficOverviewInput>
export const STrafficOverviewOutput = STrafficOverview
export type STrafficOverviewOutput = v.InferOutput<typeof STrafficOverviewOutput>

export const getTrafficOverview = oc
  .route({
    method: 'GET',
    path: '/getTrafficOverview',
    operationId: 'getTrafficOverview',
    summary: 'Get traffic overview',
    description: 'Provide aggregate traffic and Session metrics for an authorized Site.',
    tags: ['traffic-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(STrafficOverviewInput)
  .output(STrafficOverviewOutput)
