import { ERROR_CATALOG } from '@cimi/contract'
import { ReportingAdmissionError, ReportingQueryUnsupportedError } from '@cimi/kernel'
import { ORPCError, validateORPCError, type ErrorMap } from '@orpc/server'

/**
 * Translates kernel admission outcomes into the transport errors the reporting contract declares.
 * The kernel decides; this keeps the kernel free of oRPC. A filter the store cannot serve is a
 * caller error, so it maps to BAD_REQUEST rather than implying a transient outage.
 */
export function toOrpcReportingError(cause: unknown): ORPCError<string, unknown> {
  if (cause instanceof ORPCError) return cause

  if (cause instanceof ReportingAdmissionError) {
    return new ORPCError(cause.code, { cause })
  }

  if (cause instanceof ReportingQueryUnsupportedError) {
    return new ORPCError('BAD_REQUEST', { cause })
  }

  return new ORPCError('SERVICE_UNAVAILABLE', { cause })
}

export interface ApiProcedureErrorSource {
  readonly '~orpc': {
    readonly errorMap: ErrorMap
  }
}

export async function normalizeApiError(
  cause: unknown,
  procedure: ApiProcedureErrorSource,
): Promise<ORPCError<string, unknown>> {
  try {
    if (!(cause instanceof ORPCError)) return internalServerError(cause)

    const definition = getCatalogDefinition(cause.code)

    if (definition === undefined) return internalServerError(cause)

    const errorMap = procedure['~orpc'].errorMap

    const declaration = Object.prototype.hasOwnProperty.call(errorMap, cause.code)
      ? errorMap[cause.code]
      : undefined

    const validated = await validateORPCError(errorMap, cause)

    const data =
      declaration?.data !== undefined && validated.defined ? { data: validated.data } : {}

    return new ORPCError(definition.code, {
      defined: declaration !== undefined && validated.defined,
      status: definition.status,
      message: definition.message,
      cause,
      ...data,
    })
  } catch (error) {
    return internalServerError(error)
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
