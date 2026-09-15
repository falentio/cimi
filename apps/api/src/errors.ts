import { ERROR_CATALOG } from '@cimi/contract'
import { ReportingAdmissionError, ReportingQueryUnsupportedError } from '@cimi/kernel'
import { ORPCError, validateORPCError, type ErrorMap } from '@orpc/server'

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

export interface ApiProcedureErrorSource {
  readonly '~orpc': {
    readonly errorMap: ErrorMap
  }
}

export async function normalizeApiError(
  error: unknown,
  procedure: ApiProcedureErrorSource,
): Promise<ORPCError<string, unknown>> {
  try {
    if (!(error instanceof ORPCError)) return internalServerError(error)

    const definition = getCatalogDefinition(error.code)
    if (definition === undefined) return internalServerError(error)

    const errorMap = procedure['~orpc'].errorMap
    const declaration = Object.prototype.hasOwnProperty.call(errorMap, error.code)
      ? errorMap[error.code]
      : undefined
    const validated = await validateORPCError(errorMap, error)
    const data =
      declaration?.data !== undefined && validated.defined ? { data: validated.data } : {}

    return new ORPCError(definition.code, {
      defined: declaration !== undefined && validated.defined,
      status: definition.status,
      message: definition.message,
      cause: error,
      ...data,
    })
  } catch (cause) {
    return internalServerError(cause)
  }
}

function getCatalogDefinition(code: string) {
  if (!Object.prototype.hasOwnProperty.call(ERROR_CATALOG, code)) return undefined
  return ERROR_CATALOG[code as keyof typeof ERROR_CATALOG]
}

function internalServerError(cause: unknown): ORPCError<'INTERNAL_SERVER_ERROR', unknown> {
  const definition = ERROR_CATALOG.INTERNAL_SERVER_ERROR
  return new ORPCError('INTERNAL_SERVER_ERROR', {
    defined: false,
    status: definition.status,
    message: definition.message,
    cause,
  })
}
