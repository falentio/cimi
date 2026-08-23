import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDateTime, SId } from '../../../schema/index.ts'
import { SIdentifyFields } from '../schema.ts'

export const SIdentifyInput = SIdentifyFields
export type SIdentifyInput = v.InferOutput<typeof SIdentifyInput>
export const SIdentifyOutput = v.strictObject({
  identifiedUserId: SId,
  status: v.literal('active'),
  updatedAt: SDateTime,
})
export type SIdentifyOutput = v.InferOutput<typeof SIdentifyOutput>

export const identify = oc
  .route({
    method: 'POST',
    path: '/identify',
    operationId: 'identify',
    summary: 'Identify a profile',
    description:
      'Identify an application user and attach bounded traits to the Site-scoped profile.',
    tags: ['identity-profile'],
    successStatus: 200,
  })
  .meta({ auth: 'public' })
  .errors({
    BAD_REQUEST: { status: 400 },
    NOT_FOUND: { status: 404 },
    PAYLOAD_TOO_LARGE: { status: 413 },
    TOO_MANY_REQUESTS: { status: 429 },
  })
  .input(SIdentifyInput)
  .output(SIdentifyOutput)
