import * as v from 'valibot'
import { oc } from '../../../orpc/index.ts'
import { SDateTime, SId } from '../../../schema/index.ts'
import { SSiteDeletionCleanupStatus, SSiteIdFields, SSiteLifecycleStatus } from '../schema.ts'

export const SSiteDeletionStatusInput = SSiteIdFields
export type SSiteDeletionStatusInput = v.InferOutput<typeof SSiteDeletionStatusInput>
export const SSiteDeletionStatusOutput = v.pipe(
  v.strictObject({
    siteId: SId,
    status: SSiteLifecycleStatus,
    operationId: v.nullable(SId),
    requestedAt: v.nullable(SDateTime),
    deletedAt: v.nullable(SDateTime),
    recoveryDeadline: v.nullable(SDateTime),
    purgeAt: v.nullable(SDateTime),
    cleanup: SSiteDeletionCleanupStatus,
  }),
  v.check(({ status, operationId, requestedAt, deletedAt, recoveryDeadline, purgeAt }) => {
    if (status === 'active') {
      return (
        operationId === null &&
        requestedAt === null &&
        deletedAt === null &&
        recoveryDeadline === null &&
        purgeAt === null
      )
    }
    if (status === 'deleting' || status === 'recovering') {
      return operationId !== null && requestedAt !== null
    }
    return (
      operationId !== null &&
      requestedAt !== null &&
      deletedAt !== null &&
      recoveryDeadline !== null &&
      purgeAt !== null
    )
  }, 'Site lifecycle timestamps must match the reported status.'),
)
export type SSiteDeletionStatusOutput = v.InferOutput<typeof SSiteDeletionStatusOutput>

export const getSiteDeletionStatus = oc
  .route({
    method: 'GET',
    path: '/site/getSiteDeletionStatus',
    operationId: 'getSiteDeletionStatus',
    summary: 'Get site deletion status',
    description:
      'Report asynchronous Site deletion or recovery status without returning hidden Site data.',
    tags: ['site'],
    successStatus: 200,
  })
  .meta({ auth: 'admin' })
  .errors({
    UNAUTHORIZED: { status: 401 },
    FORBIDDEN: { status: 403 },
    NOT_FOUND: { status: 404 },
    BAD_REQUEST: { status: 400 },
  })
  .input(SSiteDeletionStatusInput)
  .output(SSiteDeletionStatusOutput)
