import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SCohort, SCohortSiteFields } from '../schema.ts'

export const SCohortListInput = v.strictObject(
  v.entriesFromObjects([SCohortSiteFields, SOffsetPaginationInput]),
)
export type SCohortListInput = v.InferOutput<typeof SCohortListInput>
export const SCohortListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SCohort) }), SOffsetPage]),
)
export type SCohortListOutput = v.InferOutput<typeof SCohortListOutput>

export const listCohorts = oc
  .route({
    method: 'GET',
    path: '/listCohorts',
    operationId: 'listCohorts',
    summary: 'List cohorts',
    description: 'List saved cohort definitions visible within the authorized Site scope.',
    tags: ['cohort-retention'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SCohortListInput)
  .output(SCohortListOutput)
