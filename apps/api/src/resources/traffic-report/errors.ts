import { ORPCError } from '@orpc/server'
import { ReportingAdmissionError } from '@cimi/kernel'

/**
 * Translates kernel admission outcomes into the transport errors the reporting contract declares.
 * The kernel decides; this keeps the kernel free of oRPC.
 */
export function toOrpcReportingError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ReportingAdmissionError) {
    return new ORPCError(error.code, { cause: error })
  }
  return new ORPCError('SERVICE_UNAVAILABLE', { cause: error })
}
