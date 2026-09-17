import { ReportingAdmissionError } from '@cimi/kernel'
import { ORPCError } from '@orpc/server'

export function toOrpcReportingError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ReportingAdmissionError) {
    return new ORPCError(error.code, { cause: error })
  }
  return new ORPCError('SERVICE_UNAVAILABLE', { cause: error })
}
