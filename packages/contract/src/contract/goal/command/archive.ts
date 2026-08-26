import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SGoalIdentityFields } from '../schema.ts'

export const SGoalArchiveInput = SGoalIdentityFields
export type SGoalArchiveInput = v.InferOutput<typeof SGoalArchiveInput>
export const SGoalArchiveOutput = v.void()
export type SGoalArchiveOutput = v.InferOutput<typeof SGoalArchiveOutput>

export const archiveGoal = oc
  .route({
    method: 'POST',
    path: '/goal/archiveGoal',
    operationId: 'archiveGoal',
    summary: 'Archive a goal',
    description: 'Archive a Goal definition while preserving its historical meaning.',
    tags: ['goal'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: {},
    FORBIDDEN: {},
    NOT_FOUND: {},
    CONFLICT: {},
  })
  .input(SGoalArchiveInput)
  .output(SGoalArchiveOutput)
