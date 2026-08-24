import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SGoal, SGoalIdentityFields } from '../schema.ts'

export const SGoalGetInput = SGoalIdentityFields
export type SGoalGetInput = v.InferOutput<typeof SGoalGetInput>
export const SGoalGetOutput = SGoal
export type SGoalGetOutput = v.InferOutput<typeof SGoalGetOutput>

export const getGoal = oc
  .route({
    method: 'GET',
    path: '/getGoal',
    operationId: 'getGoal',
    summary: 'Get a goal',
    description: 'Return one Goal definition after Site authorization.',
    tags: ['goal'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    NOT_FOUND: { status: 404 },
  })
  .input(SGoalGetInput)
  .output(SGoalGetOutput)
