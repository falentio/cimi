import { and, eq } from 'drizzle-orm'
import { schema, type Db, type JsonObject, type JsonValue } from '@cimi/db'
import type { AnalyticsReportScalar } from '@cimi/db'
import { isRecord } from '@cimi/utils'

export type ReportingProfileTraits = ReadonlyMap<string, JsonObject>

export interface ReportingProfile {
  readonly identifiedUserId: string
  readonly traits: JsonObject
}

export function readActiveProfiles(db: Db, siteId: string): ReadonlyMap<string, ReportingProfile> {
  const rows = db
    .select({
      identifiedUserId: schema.TIdentityProfile.identifiedUserId,
      traits: schema.TIdentityProfile.traits,
    })
    .from(schema.TIdentityProfile)
    .where(
      and(eq(schema.TIdentityProfile.siteId, siteId), eq(schema.TIdentityProfile.status, 'active')),
    )
    .all()

  return new Map(
    rows.map((row) => {
      const traits = readJsonObject(row.traits ?? {})

      return [row.identifiedUserId, { identifiedUserId: row.identifiedUserId, traits }] as const
    }),
  )
}

export function readActiveProfileTraits(db: Db, siteId: string): ReportingProfileTraits {
  return new Map(
    [...readActiveProfiles(db, siteId)].map(([identifiedUserId, profile]) => [
      identifiedUserId,
      profile.traits,
    ]),
  )
}

export function readProfileTrait(
  traits: JsonObject | undefined,
  field: string,
): AnalyticsReportScalar | undefined {
  let value: unknown = traits

  for (const key of field.slice('trait.'.length).split('.')) {
    if (!isRecord(value)) return undefined
    value = value[key]
  }

  return isAnalyticsReportScalar(value) ? value : undefined
}

function isAnalyticsReportScalar(value: unknown): value is AnalyticsReportScalar {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function readJsonObject(value: JsonObject): JsonObject {
  if (!isRecord(value)) throw new Error('Profile traits are not a JSON object')
  const result: JsonObject = {}

  for (const [key, child] of Object.entries(value)) {
    // SAFETY: readJsonValue validates each entry and throws on non-JSON values.
    result[key] = readJsonValue(child as JsonValue)
  }

  return result
}

function readJsonValue(value: JsonValue): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Profile traits are not a JSON object')

    return value
  }

  if (Array.isArray(value)) return value.map(readJsonValue)

  return readJsonObject(value)
}
