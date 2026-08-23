import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SQueryInput } from '../../../schema/index.ts'
import { SEventPageResult, SEventSiteFields } from '../schema.ts'

export const SEventListInput = v.strictObject(v.entriesFromObjects([SEventSiteFields, SQueryInput]))
export type SEventListInput = v.InferOutput<typeof SEventListInput>
export const SEventListOutput = SEventPageResult
export type SEventListOutput = v.InferOutput<typeof SEventListOutput>

export const listEvents = oc
  .route({
    method: 'GET',
    path: '/listEvents',
    operationId: 'listEvents',
    summary: 'List events',
    description: 'Explore accepted Events for debugging and analysis with cursor pagination.',
    tags: ['event-report'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors(EQuery)
  .input(SEventListInput)
  .output(SEventListOutput)
