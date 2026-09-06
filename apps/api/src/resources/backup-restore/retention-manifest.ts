import { BackupIncompatibilityError } from './errors.ts'

export interface RetentionManifestBoundary {
  readonly siteId: string
  readonly installationId: string
  readonly policyId: string
  readonly reportingTimezone: string
  readonly localDay: string
  readonly eventOccurrenceCutoffAt: Date
  readonly rawReceiptCutoffAt: Date
  readonly profileActivityCutoffAt: Date
  readonly replayReceiptCutoffAt: Date | null
  readonly effectiveAt: Date
  readonly updatedAt: Date
}

export interface RetentionManifest {
  readonly version: 1
  readonly boundaries: readonly RetentionManifestBoundary[]
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[]

interface JsonObject {
  [key: string]: JsonValue
}

interface RetentionMetadataBoundary extends JsonObject {
  siteId: string
  installationId: string
  policyId: string
  reportingTimezone: string
  localDay: string
  eventOccurrenceCutoffAt: string
  rawReceiptCutoffAt: string
  profileActivityCutoffAt: string
  replayReceiptCutoffAt: string | null
  effectiveAt: string
  updatedAt: string
}

interface RetentionMetadataManifest extends JsonObject {
  version: 1
  boundaries: RetentionMetadataBoundary[]
}

interface RetentionMetadataShape extends JsonObject {
  retentionManifest: RetentionMetadataManifest
}

export type RetentionMetadata = RetentionMetadataShape

export function encodeRetentionManifest(manifest: RetentionManifest): RetentionMetadata {
  if (manifest.version !== 1) throw incompatible('Retention manifest version is unsupported')
  const siteIds = new Set<string>()
  const boundaries = manifest.boundaries.map((boundary) => {
    assertUniqueSite(siteIds, boundary.siteId)
    assertBoundaryStrings(boundary)
    assertValidLocalDay(boundary.localDay)
    assertValidTimezone(boundary.reportingTimezone)
    return {
      siteId: boundary.siteId,
      installationId: boundary.installationId,
      policyId: boundary.policyId,
      reportingTimezone: boundary.reportingTimezone,
      localDay: boundary.localDay,
      eventOccurrenceCutoffAt: encodeDate(boundary.eventOccurrenceCutoffAt),
      rawReceiptCutoffAt: encodeDate(boundary.rawReceiptCutoffAt),
      profileActivityCutoffAt: encodeDate(boundary.profileActivityCutoffAt),
      replayReceiptCutoffAt:
        boundary.replayReceiptCutoffAt === null ? null : encodeDate(boundary.replayReceiptCutoffAt),
      effectiveAt: encodeDate(boundary.effectiveAt),
      updatedAt: encodeDate(boundary.updatedAt),
    }
  })
  return { retentionManifest: { version: 1, boundaries } }
}

export function decodeRetentionManifest(metadata: unknown): RetentionManifest | null {
  if (metadata === null || metadata === undefined) return null
  if (!isRecord(metadata)) throw incompatible('Retention metadata is malformed')
  if (!('retentionManifest' in metadata)) return null
  return decodeManifest(metadata['retentionManifest'])
}

function decodeManifest(value: unknown): RetentionManifest {
  if (!isRecord(value) || value['version'] !== 1 || !isUnknownArray(value['boundaries'])) {
    throw incompatible('Retention manifest version or shape is unsupported')
  }
  const siteIds = new Set<string>()
  const boundaries = value['boundaries'].map((boundary) => {
    const decoded = decodeBoundary(boundary)
    assertUniqueSite(siteIds, decoded.siteId)
    return decoded
  })
  return { version: 1, boundaries }
}

function decodeBoundary(value: unknown): RetentionManifestBoundary {
  if (!isRecord(value)) throw incompatible('Retention boundary is malformed')
  const siteId = readString(value, 'siteId')
  const installationId = readString(value, 'installationId')
  const policyId = readString(value, 'policyId')
  const reportingTimezone = readString(value, 'reportingTimezone')
  const localDay = readString(value, 'localDay')
  assertValidLocalDay(localDay)
  assertValidTimezone(reportingTimezone)
  return {
    siteId,
    installationId,
    policyId,
    reportingTimezone,
    localDay,
    eventOccurrenceCutoffAt: decodeDate(value, 'eventOccurrenceCutoffAt'),
    rawReceiptCutoffAt: decodeDate(value, 'rawReceiptCutoffAt'),
    profileActivityCutoffAt: decodeDate(value, 'profileActivityCutoffAt'),
    replayReceiptCutoffAt:
      value['replayReceiptCutoffAt'] === null ? null : decodeDate(value, 'replayReceiptCutoffAt'),
    effectiveAt: decodeDate(value, 'effectiveAt'),
    updatedAt: decodeDate(value, 'updatedAt'),
  }
}

function assertBoundaryStrings(boundary: RetentionManifestBoundary): void {
  for (const [name, value] of [
    ['siteId', boundary.siteId],
    ['installationId', boundary.installationId],
    ['policyId', boundary.policyId],
    ['reportingTimezone', boundary.reportingTimezone],
    ['localDay', boundary.localDay],
  ] as const) {
    if (value.length === 0) throw incompatible(`Retention boundary ${name} is empty`)
  }
}

function assertUniqueSite(siteIds: Set<string>, siteId: string): void {
  if (siteIds.has(siteId)) throw incompatible('Retention manifest contains duplicate sites')
  siteIds.add(siteId)
}

function readString(value: Record<string, unknown>, name: string): string {
  const field = value[name]
  if (typeof field !== 'string' || field.length === 0) {
    throw incompatible(`Retention boundary ${name} is invalid`)
  }
  return field
}

function encodeDate(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw incompatible('Retention manifest contains an invalid date')
  }
  return value.toISOString()
}

function decodeDate(value: Record<string, unknown>, name: string): Date {
  const field = value[name]
  if (typeof field !== 'string') throw incompatible(`Retention boundary ${name} is invalid`)
  const date = new Date(field)
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== field) {
    throw incompatible(`Retention boundary ${name} is an invalid date`)
  }
  return date
}

function assertValidLocalDay(value: string): void {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) throw incompatible('Retention boundary local day is invalid')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw incompatible('Retention boundary local day is invalid')
  }
}

function assertValidTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date(0))
  } catch {
    throw incompatible('Retention boundary reporting timezone is invalid')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function incompatible(message: string): never {
  throw new BackupIncompatibilityError(message)
}
