import { ReportingAdmissionError } from '@cimi/kernel'
import { ORPCError } from '@orpc/server'

export function toOrpcReportingError(cause: unknown): ORPCError<string, unknown> {
  if (cause instanceof ReportingAdmissionError) {
    return new ORPCError(cause.code, { cause })
  }

  return new ORPCError('SERVICE_UNAVAILABLE', { cause })
}
