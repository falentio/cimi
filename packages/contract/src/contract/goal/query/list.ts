import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SOffsetPage, SOffsetPaginationInput, SPageItems } from '../../../schema/index.ts'
import { SGoal, SGoalSiteFields } from '../schema.ts'

export const SGoalListInput = v.strictObject(
  v.entriesFromObjects([SGoalSiteFields, SOffsetPaginationInput]),
)
export type SGoalListInput = v.InferOutput<typeof SGoalListInput>
export const SGoalListOutput = v.strictObject(
  v.entriesFromObjects([v.strictObject({ items: SPageItems(SGoal) }), SOffsetPage]),
)
export type SGoalListOutput = v.InferOutput<typeof SGoalListOutput>

export const listGoals = oc
  .route({
    method: 'GET',
    path: '/listGoals',
    operationId: 'listGoals',
    summary: 'List goals',
    description:
      'List active and archived Goal definitions visible within the authorized Site scope.',
    tags: ['goal'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SGoalListInput)
  .output(SGoalListOutput)
