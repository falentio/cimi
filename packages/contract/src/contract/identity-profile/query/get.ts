import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SProfile, SProfileIdentityFields } from '../schema.ts'

export const SProfileGetInput = SProfileIdentityFields
export type SProfileGetInput = v.InferOutput<typeof SProfileGetInput>
export const SProfileGetOutput = SProfile
export type SProfileGetOutput = v.InferOutput<typeof SProfileGetOutput>

export const getProfile = oc
  .route({
    method: 'GET',
    path: '/getProfile',
    operationId: 'getProfile',
    summary: 'Get a profile',
    description:
      'Return one Site-scoped profile and its bounded Profile Epoch history; non-active profiles return status only.',
    tags: ['identity-profile'],
    successStatus: 200,
  })
  .meta({ auth: 'authenticated' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
  })
  .input(SProfileGetInput)
  .output(SProfileGetOutput)
