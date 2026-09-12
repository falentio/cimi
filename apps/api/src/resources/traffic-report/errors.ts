import { ORPCError } from '@orpc/server'
import { ReportingAdmissionError, ReportingQueryUnsupportedError } from '@cimi/kernel'

/**
 * Translates kernel admission outcomes into the transport errors the reporting contract declares.
 * The kernel decides; this keeps the kernel free of oRPC. A filter the store cannot serve is a
 * caller error, so it maps to BAD_REQUEST rather than implying a transient outage.
 */
export function toOrpcReportingError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error
  if (error instanceof ReportingAdmissionError) {
    return new ORPCError(error.code, { cause: error })
  }
  if (error instanceof ReportingQueryUnsupportedError) {
    return new ORPCError('BAD_REQUEST', { cause: error })
  }
  return new ORPCError('SERVICE_UNAVAILABLE', { cause: error })
}
