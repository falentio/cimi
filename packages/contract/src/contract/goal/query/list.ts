import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { EQuery, SCursor, SPaginationInput } from '../../../schema/index.ts'
import { SGoal, SGoalSiteFields } from '../schema.ts'

export const SGoalListInput = v.strictObject(
  v.entriesFromObjects([SGoalSiteFields, SPaginationInput]),
)
export type SGoalListInput = v.InferOutput<typeof SGoalListInput>
export const SGoalListOutput = v.strictObject({
  items: v.array(SGoal),
  nextCursor: v.nullable(SCursor),
})
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
  .errors(EQuery)
  .input(SGoalListInput)
  .output(SGoalListOutput)
