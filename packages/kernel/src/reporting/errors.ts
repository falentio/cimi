export type ReportingAdmissionErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'QUERY_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'

export type ReportingAdmissionErrorReason =
  | 'invalid-period'
  | 'comparison-not-adjacent'
  | 'comparison-not-equal-length'
  | 'bucket-bound'
  | 'metadata-missing'
  | 'analytics-not-ready'
  | 'port-failure'
  | 'statistics-uncertain'
  | 'projection-gap'
  | 'retention-incomplete'
  | 'fact-work-uncertain'
  | 'fact-work-over-budget'

const ERROR_MESSAGES: Readonly<Record<ReportingAdmissionErrorCode, string>> = {
  BAD_REQUEST: 'The reporting request is invalid.',
  NOT_FOUND: 'The requested Site was not found.',
  QUERY_LIMIT_EXCEEDED: 'The reporting query exceeds the available query limits.',
  SERVICE_UNAVAILABLE: 'Analytics reporting is temporarily unavailable.',
}

export class ReportingAdmissionError extends Error {
  readonly code: ReportingAdmissionErrorCode
  readonly reason: ReportingAdmissionErrorReason

  constructor(input: {
    readonly code: ReportingAdmissionErrorCode
    readonly reason: ReportingAdmissionErrorReason
    readonly cause?: unknown
  }) {
    super(ERROR_MESSAGES[input.code], { cause: input.cause })
    this.name = 'ReportingAdmissionError'
    this.code = input.code
    this.reason = input.reason
  }
}

export function badReportingRequest(
  reason: ReportingAdmissionErrorReason,
): ReportingAdmissionError {
  return new ReportingAdmissionError({ code: 'BAD_REQUEST', reason })
}

export function queryLimitExceeded(reason: ReportingAdmissionErrorReason): ReportingAdmissionError {
  return new ReportingAdmissionError({ code: 'QUERY_LIMIT_EXCEEDED', reason })
}

export function serviceUnavailable(
  reason: ReportingAdmissionErrorReason,
  cause?: unknown,
): ReportingAdmissionError {
  return new ReportingAdmissionError({ code: 'SERVICE_UNAVAILABLE', reason, cause })
}
