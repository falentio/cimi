import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SFunnelIdentityFields } from '../schema.ts'

export const SFunnelArchiveInput = SFunnelIdentityFields
export type SFunnelArchiveInput = v.InferOutput<typeof SFunnelArchiveInput>
export const SFunnelArchiveOutput = v.void()
export type SFunnelArchiveOutput = v.InferOutput<typeof SFunnelArchiveOutput>

export const archiveFunnel = oc
  .route({
    method: 'POST',
    path: '/archiveFunnel',
    operationId: 'archiveFunnel',
    summary: 'Archive a funnel',
    description: 'Archive a Funnel definition without deleting historical reports.',
    tags: ['funnel'],
    successStatus: 204,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    CONFLICT: { status: 409 },
  })
  .input(SFunnelArchiveInput)
  .output(SFunnelArchiveOutput)
