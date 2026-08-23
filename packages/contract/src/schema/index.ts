import * as v from 'valibot'

export const SId = v.pipe(v.string(), v.minLength(1), v.maxLength(128))
export const SName = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
export const SDateTime = v.pipe(v.string(), v.isoDateTimeSecond())
export const SCursor = v.pipe(v.string(), v.minLength(1), v.maxLength(4096))
export const SPageSize = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100))
export const SPaginationInput = v.strictObject({
  cursor: v.optional(SCursor),
  limit: v.optional(SPageSize),
})
export const SScalar = v.union([v.string(), v.number(), v.boolean(), v.null()])
export const SScalarKey = v.pipe(v.string(), v.minLength(1), v.maxLength(64))
export const SScalarMap = v.record(SScalarKey, SScalar)

export const SSortDirection = v.picklist(['asc', 'desc'])

export const SQueryFilter = v.strictObject({
  field: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  operator: v.picklist(['equals', 'not_equals', 'contains', 'greater_than', 'less_than']),
  values: v.pipe(v.array(SScalar), v.minLength(1), v.maxLength(20)),
})

export const queryFields = {
  from: SDateTime,
  to: SDateTime,
  filters: v.optional(v.pipe(v.array(SQueryFilter), v.maxLength(20))),
  sort: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(64))),
  direction: v.optional(SSortDirection),
  cursor: v.optional(SCursor),
  limit: v.optional(SPageSize),
}

export const SQueryInput = v.strictObject(queryFields)

export const SCreated = v.strictObject({
  createdAt: SDateTime,
  updatedAt: SDateTime,
})

export const ERead = {
  UNAUTHORIZED: { status: 401 },
  FORBIDDEN: { status: 403 },
  NOT_FOUND: { status: 404 },
  BAD_REQUEST: { status: 400 },
  INTERNAL_SERVER_ERROR: { status: 500 },
} as const

export const EQuery = {
  ...ERead,
  QUERY_LIMIT_EXCEEDED: { status: 422 },
} as const

export const ECommand = {
  ...ERead,
  CONFLICT: { status: 409 },
} as const

export const EIngestion = {
  BAD_REQUEST: { status: 400 },
  NOT_FOUND: { status: 404 },
  PAYLOAD_TOO_LARGE: { status: 413 },
  TOO_MANY_REQUESTS: { status: 429 },
  INTERNAL_SERVER_ERROR: { status: 500 },
} as const
