import { createHash } from 'node:crypto'
import { schema } from '@cimi/contract'
import type { LifecycleLock, RetentionResolver } from '@cimi/kernel'
import { resolveSiteLocalCutoff } from '@cimi/utils'
import { ORPCError } from '@orpc/server'
import { safeParse, type InferOutput } from 'valibot'
import { sanitizeDestination } from '../collection-policy/evaluator.ts'
import {
  SCollectEventInput,
  SCollectEventOutput,
  SCollectEventsInput,
  SCollectEventsOutput,
  SEvent,
} from '@cimi/contract'
import type { CollectionPolicyService } from '../collection-policy/service.ts'
import type { RetentionPolicyRepository } from '../retention-policy/repository.ts'
import type { SiteRepository } from '../site/repository.ts'
import {
  AcceptanceAdmissionStoppedError,
  AcceptanceCoalescer,
  AcceptanceQueueSaturatedError,
  type ReservableCandidate,
  type Reservation,
} from './coalescer.ts'
import type { AcceptanceRepository, EventInput, NormalizedEvent } from './repository.ts'

export type CollectEventInput = InferOutput<typeof SCollectEventInput>
export type CollectEventOutput = InferOutput<typeof SCollectEventOutput>
export type CollectEventsInput = InferOutput<typeof SCollectEventsInput>
export type CollectEventsOutput = InferOutput<typeof SCollectEventsOutput>

export interface EventIngestionServiceDependencies {
  readonly siteRepository: SiteRepository
  readonly collectionPolicy: CollectionPolicyService
  readonly retention: RetentionPolicyRepository | RetentionResolver
  readonly acceptance: AcceptanceRepository
  readonly lifecycleLock?: LifecycleLock | undefined
  readonly clock?: (() => Date) | undefined
  readonly coalescer?: AcceptanceCoalescer | undefined
  readonly protection?: IngestionProtection | undefined
  readonly identitySession?: IdentitySessionResolver | undefined
}

export interface IngestionRequestContext {
  readonly sourceIp?: string | undefined
  readonly isBot?: boolean | undefined
}

export interface IngestionProtection {
  consume(input: {
    readonly siteId: string
    readonly sourceIp?: string | undefined
    readonly units: number
    readonly now: Date
  }): Promise<void>
}

export interface IdentitySessionResolver {
  resolve(input: {
    readonly siteId: string
    readonly event: NormalizedEvent
    readonly receiptTime: Date
    readonly collectionContext: EventInput['collectionContext']
    readonly identifiedUserId: string | null
  }): Promise<IdentitySessionAssignment>
}

export interface IdentitySessionAssignment {
  readonly visitorId: string | null
  readonly identifiedUserId: string | null
  readonly analyticsSessionId: string | null
}

interface PreparedEvent {
  readonly candidate: ReservableCandidate
}

interface PendingBatchResult {
  readonly index: number
  readonly candidate: ReservableCandidate
}

interface BatchAdmission {
  readonly results: Array<CollectEventsOutput['results'][number] | undefined>
  readonly waits: readonly Promise<void>[]
}

type SuccessfulReservation = Exclude<Reservation, { readonly status: 'conflict' }>

export class EventIngestionService {
  readonly coalescer: AcceptanceCoalescer
  private readonly siteRepository: SiteRepository
  private readonly collectionPolicy: CollectionPolicyService
  private readonly retention: RetentionPolicyRepository | RetentionResolver
  private readonly acceptance: AcceptanceRepository
  private readonly lifecycleLock: LifecycleLock | undefined
  private readonly clock: () => Date
  private readonly protection: IngestionProtection | undefined
  private readonly identitySession: IdentitySessionResolver | undefined
  private admissionTail: Promise<void> = Promise.resolve()

  constructor({
    siteRepository,
    collectionPolicy,
    retention,
    acceptance,
    lifecycleLock,
    clock,
    coalescer,
    protection,
    identitySession,
  }: EventIngestionServiceDependencies) {
    this.siteRepository = siteRepository
    this.collectionPolicy = collectionPolicy
    this.retention = retention
    this.acceptance = acceptance
    this.lifecycleLock = lifecycleLock
    this.clock = clock ?? (() => new Date())
    this.protection = protection
    this.identitySession = identitySession
    this.coalescer =
      coalescer ??
      new AcceptanceCoalescer({
        repository: acceptance,
        clock: this.clock,
      })
  }

  async collectEvent(
    input: CollectEventInput,
    request: IngestionRequestContext = {},
  ): Promise<CollectEventOutput> {
    const admission = await this.withAdmissionLease(input.ingestionIdentifier, () =>
      this.collectEventAdmitted(input, request),
    )
    if ('output' in admission) return admission.output
    try {
      await admission.reservation.completion
    } catch (error) {
      throw acceptanceError(error)
    }
    return {
      status: admission.reservation.status,
      eventId: input.eventId,
      receiptTime: admission.reservation.receiptTime,
    }
  }

  private async collectEventAdmitted(
    input: CollectEventInput,
    request: IngestionRequestContext,
  ): Promise<
    { readonly output: CollectEventOutput } | { readonly reservation: SuccessfulReservation }
  > {
    const site = await this.resolveSite(input.ingestionIdentifier)
    await this.consumeProtection(site.id, request.sourceIp, 1)
    const durable = await this.acceptanceRecord(site.id, input.eventId)
    const fingerprint = fingerprintEvent(input)
    if (durable !== undefined) {
      return { output: this.existingResult(input.eventId, durable, fingerprint) }
    }
    const pending = this.coalescer.pendingReservation(site.id, input.eventId, fingerprint)
    if (pending !== undefined) {
      if (pending.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
      return { reservation: pending }
    }

    let prepared: PreparedEvent
    try {
      prepared = await this.prepare(
        { ...input, collectionContext: input.collectionContext },
        site,
        request,
      )
    } catch (error) {
      if (isPolicyRejection(error)) throw new ORPCError('FORBIDDEN', { status: 403 })
      throw error
    }
    const [reservation] = await this.reserve([prepared.candidate])
    if (reservation === undefined) throw new Error('Acceptance reservation disappeared')
    if (reservation.status === 'conflict') throw new ORPCError('CONFLICT', { status: 409 })
    return { reservation }
  }

  async collectEvents(
    input: CollectEventsInput,
    request: IngestionRequestContext = {},
  ): Promise<CollectEventsOutput> {
    const admission = await this.withAdmissionLease(input.ingestionIdentifier, () =>
      this.collectEventsAdmitted(input, request),
    )
    try {
      await Promise.all(admission.waits)
    } catch (error) {
      throw acceptanceError(error)
    }
    return {
      results: admission.results.map((result) => {
        if (result === undefined) throw new Error('Batch result count mismatch')
        return result
      }),
    }
  }

  private async collectEventsAdmitted(
    input: CollectEventsInput,
    request: IngestionRequestContext,
  ): Promise<BatchAdmission> {
    const site = await this.resolveSite(input.ingestionIdentifier)
    await this.consumeProtection(site.id, request.sourceIp, input.events.length)
    const results: Array<CollectEventsOutput['results'][number] | undefined> = Array(
      input.events.length,
    ).fill(undefined)
    const candidates: PendingBatchResult[] = []
    const waits: Promise<void>[] = []
    const preparedByEventId = new Map<
      string,
      { readonly fingerprint: string; readonly candidate: ReservableCandidate }
    >()

    for (const [index, rawEvent] of input.events.entries()) {
      const eventInput = withBatchContext(rawEvent, input)
      const parsed = safeParse(SEvent, eventInput)
      if (!parsed.success) {
        results[index] = {
          status: 'itemError',
          eventId: validEventId(rawEvent),
          code: isOversizedEvent(rawEvent) ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        }
        continue
      }

      const event = parsed.output
      if (event.ingestionIdentifier !== input.ingestionIdentifier) {
        throw new ORPCError('BAD_REQUEST')
      }
      const fingerprint = fingerprintEvent(event)
      const prepared = preparedByEventId.get(event.eventId)
      if (prepared !== undefined) {
        if (prepared.fingerprint !== fingerprint) {
          results[index] = { status: 'itemError', eventId: event.eventId, code: 'CONFLICT' }
        } else {
          candidates.push({ index, candidate: prepared.candidate })
        }
        continue
      }
      const durable = await this.acceptanceRecord(site.id, event.eventId)
      if (durable !== undefined) {
        results[index] = this.existingBatchResult(event.eventId, durable, fingerprint)
        continue
      }
      const pending = this.coalescer.pendingReservation(site.id, event.eventId, fingerprint)
      if (pending !== undefined) {
        if (pending.status === 'conflict') {
          results[index] = { status: 'itemError', eventId: event.eventId, code: 'CONFLICT' }
        } else {
          waits.push(
            pending.completion.then(() => {
              results[index] = {
                status: 'duplicate',
                eventId: event.eventId,
                receiptTime: pending.receiptTime,
              }
            }),
          )
        }
        continue
      }

      try {
        const prepared = await this.prepare(event, site, request)
        candidates.push({ index, candidate: prepared.candidate })
        preparedByEventId.set(event.eventId, {
          fingerprint,
          candidate: prepared.candidate,
        })
      } catch (error) {
        if (isPolicyRejection(error)) {
          results[index] = { status: 'rejected', eventId: event.eventId, reason: 'policy' }
          continue
        }
        if (error instanceof ORPCError && error.code === 'BAD_REQUEST') {
          results[index] = {
            status: 'itemError',
            eventId: event.eventId,
            code: 'BAD_REQUEST',
          }
          continue
        }
        throw error
      }
    }

    const reservations = await this.reserve(candidates.map(({ candidate }) => candidate))
    for (const [offset, reservation] of reservations.entries()) {
      const pending = candidates[offset]
      if (pending === undefined) throw new Error('Acceptance result count mismatch')
      if (reservation.status === 'conflict') {
        results[pending.index] = {
          status: 'itemError',
          eventId: pending.candidate.event.eventId,
          code: 'CONFLICT',
        }
        continue
      }
      waits.push(
        reservation.completion.then(() => {
          results[pending.index] = {
            status: reservation.status,
            eventId: pending.candidate.event.eventId,
            receiptTime: reservation.receiptTime,
          }
        }),
      )
    }
    return { results, waits }
  }

  flush(): Promise<void> {
    return this.coalescer.flush()
  }

  stop(): Promise<void> {
    return this.coalescer.stop()
  }

  private async resolveSite(ingestionIdentifier: string): Promise<SiteRepository.SiteRecord> {
    const site = await this.siteRepository.findByIngestionIdentifier(ingestionIdentifier)
    if (site === undefined || site.status !== 'active') throw new ORPCError('NOT_FOUND')
    return site
  }

  private async acceptanceRecord(siteId: string, eventId: string) {
    try {
      return await this.acceptance.findByEventId(siteId, eventId)
    } catch (error) {
      throw acceptanceError(error)
    }
  }

  private async prepare(
    input: EventInput,
    site: SiteRepository.SiteRecord,
    request: IngestionRequestContext = {},
  ): Promise<PreparedEvent> {
    const retention = await this.retentionPolicy(site.id)
    const decision = await this.collectionPolicy.admit({
      siteId: site.id,
      hostname: site.hostname,
      path: input.pagePath,
      ip: request.sourceIp,
      isBot: request.isBot,
      referrer: input.referrer,
      properties: input.properties,
      identifiedUserId: input.identifiedUserId,
      collectionContext: input.collectionContext,
      operation: 'event',
    })
    if (decision.outcome.kind === 'rejected') throw new PolicyRejectionError()

    const validationTime = this.clock()
    const occurrence =
      input.occurrenceTime === undefined ? validationTime : new Date(input.occurrenceTime)
    if (!Number.isFinite(occurrence.getTime())) throw new ORPCError('BAD_REQUEST')
    if (occurrence.getTime() > validationTime.getTime() + 5 * 60 * 1000) {
      throw new ORPCError('BAD_REQUEST')
    }
    const cutoff = resolveSiteLocalCutoff({
      now: validationTime,
      timeZone: site.reportingTimezone,
      retentionMonths: retention.eventMonths,
    })
    if (occurrence < cutoff) throw new ORPCError('BAD_REQUEST')

    const destination =
      input.kind === 'outbound'
        ? sanitizeDestination(input.destination, decision.values)
        : undefined
    if (input.kind === 'outbound' && destination === null) throw new ORPCError('BAD_REQUEST')

    const normalizedDraft = normalizeEvent(
      input,
      decision.outcome,
      occurrence.toISOString(),
      destination,
      decision.outcome.identifiedUserId,
    )
    const identity = await this.resolveIdentity({
      siteId: site.id,
      event: normalizedDraft,
      receiptTime: validationTime,
      collectionContext: input.collectionContext,
      identifiedUserId: decision.outcome.identifiedUserId,
    })
    const receipt = this.clock()
    const normalizedOccurrence = input.occurrenceTime === undefined ? receipt : occurrence
    const normalizedCutoff = resolveSiteLocalCutoff({
      now: receipt,
      timeZone: site.reportingTimezone,
      retentionMonths: retention.eventMonths,
    })
    if (
      normalizedOccurrence.getTime() > receipt.getTime() + 5 * 60 * 1000 ||
      normalizedOccurrence < normalizedCutoff
    )
      throw new ORPCError('BAD_REQUEST')

    const event = normalizeEvent(
      input,
      decision.outcome,
      normalizedOccurrence.toISOString(),
      destination,
      identity.identifiedUserId,
    )
    return {
      candidate: {
        siteId: site.id,
        event,
        late: receipt.getTime() - normalizedOccurrence.getTime() > 15 * 60 * 1000,
        policyRevisionId: decision.revision.id,
        payloadFingerprint: fingerprintEvent(input),
        visitorId: identity.visitorId,
        analyticsSessionId: identity.analyticsSessionId,
      },
    }
  }

  private async resolveIdentity(input: {
    readonly siteId: string
    readonly event: NormalizedEvent
    readonly receiptTime: Date
    readonly collectionContext: EventInput['collectionContext']
    readonly identifiedUserId: string | null
  }): Promise<IdentitySessionAssignment> {
    if (this.identitySession !== undefined) return this.identitySession.resolve(input)
    if (input.identifiedUserId !== null) {
      throw new ORPCError('BAD_REQUEST')
    }
    return { visitorId: null, identifiedUserId: null, analyticsSessionId: null }
  }

  private async consumeProtection(
    siteId: string,
    sourceIp: string | undefined,
    units: number,
  ): Promise<void> {
    if (this.protection === undefined) return
    try {
      await this.protection.consume({ siteId, sourceIp, units, now: this.clock() })
    } catch (error) {
      if (error instanceof ORPCError) throw error
      throw new ORPCError('TOO_MANY_REQUESTS', { status: 429 })
    }
  }

  private async retentionPolicy(siteId: string): Promise<{ readonly eventMonths: number }> {
    if ('effective' in this.retention) {
      const policy = await this.retention.effective(siteId)
      return { eventMonths: policy.eventMonths }
    }
    const resolution = await this.retention.findResolved({ siteId })
    return { eventMonths: resolution.effectivePolicy.eventMonths }
  }

  private reserve(candidates: readonly ReservableCandidate[]): Promise<readonly Reservation[]> {
    return this.coalescer.reserveMany(candidates).catch((error: unknown) => {
      throw acceptanceError(error)
    })
  }

  private async withAdmissionLease<T>(
    ingestionIdentifier: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (this.lifecycleLock === undefined) return operation()
    const previous = this.admissionTail
    let release!: () => void
    this.admissionTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      const lease = await this.lifecycleLock.acquire('site_deletion')
      if (lease === undefined) {
        const site = await this.siteRepository.findByIngestionIdentifier(ingestionIdentifier)
        if (site === undefined) throw new ORPCError('NOT_FOUND')
        throw new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
      }
      try {
        return await operation()
      } finally {
        await lease.release()
      }
    } finally {
      release()
    }
  }

  private existingResult(
    eventId: string,
    record: { readonly receiptTime: string; readonly payloadFingerprint: string },
    fingerprint: string,
  ): CollectEventOutput {
    if (record.payloadFingerprint !== fingerprint) throw new ORPCError('CONFLICT', { status: 409 })
    return { status: 'duplicate', eventId, receiptTime: record.receiptTime }
  }

  private existingBatchResult(
    eventId: string,
    record: { readonly receiptTime: string; readonly payloadFingerprint: string },
    fingerprint: string,
  ): CollectEventsOutput['results'][number] {
    if (record.payloadFingerprint !== fingerprint) {
      return { status: 'itemError', eventId, code: 'CONFLICT' }
    }
    return { status: 'duplicate', eventId, receiptTime: record.receiptTime }
  }
}

class PolicyRejectionError extends Error {}

function isPolicyRejection(error: unknown): error is PolicyRejectionError {
  return error instanceof PolicyRejectionError
}

function acceptanceError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error
  if (
    error instanceof AcceptanceQueueSaturatedError ||
    error instanceof AcceptanceAdmissionStoppedError
  ) {
    return new ORPCError('SERVICE_UNAVAILABLE', { status: 503 })
  }
  return new ORPCError('SERVICE_UNAVAILABLE', { status: 503, cause: error })
}

function normalizeEvent(
  input: EventInput,
  outcome: Extract<
    Awaited<ReturnType<CollectionPolicyService['admit']>>['outcome'],
    { kind: 'accepted' }
  >,
  occurrenceTime: string,
  destination: string | null | undefined,
  identifiedUserId: string | null,
): NormalizedEvent {
  const common = {
    eventId: input.eventId,
    occurrenceTime,
    identifiedUserId,
    properties: outcome.properties,
  }
  switch (input.kind) {
    case 'page_view':
      return {
        ...common,
        kind: input.kind,
        pagePath: outcome.urls.path,
        referrer: outcome.urls.referrer,
      }
    case 'custom_event':
      return { ...common, kind: input.kind, name: input.name }
    case 'outbound':
      return {
        ...common,
        kind: input.kind,
        destination: destination ?? input.destination,
        name: input.name ?? null,
      }
    case 'performance':
      return {
        ...common,
        kind: input.kind,
        name: input.name,
        value: input.value,
        unit: input.unit ?? null,
      }
    case 'error':
      return {
        ...common,
        kind: input.kind,
        name: input.name,
        code: input.code ?? null,
        message: input.message ?? null,
      }
    default: {
      const exhaustive: never = input
      return exhaustive
    }
  }
}

function fingerprintEvent(event: EventInput): string {
  return createHash('sha256')
    .update(JSON.stringify(sortRecord(event)))
    .digest('hex')
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecord)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'ingestionIdentifier')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortRecord(entry)]),
  )
}

function withBatchContext(rawEvent: unknown, input: CollectEventsInput): unknown {
  if (!isRecord(rawEvent)) return rawEvent
  const event = { ...rawEvent }
  if (!('ingestionIdentifier' in event)) event['ingestionIdentifier'] = input.ingestionIdentifier
  if (input.collectionContext !== undefined && !('collectionContext' in event)) {
    event['collectionContext'] = input.collectionContext
  }
  return event
}

function validEventId(value: unknown): string | null {
  if (!isRecord(value)) return null
  const parsed = safeParse(schema.SId, value['eventId'])
  return parsed.success ? parsed.output : null
}

function isOversizedEvent(value: unknown): boolean {
  if (!isRecord(value)) return false
  for (const [key, entry] of Object.entries(value)) {
    if (
      typeof entry === 'string' &&
      (((key === 'pagePath' || key === 'referrer') && entry.length > 2048) ||
        (key !== 'eventId' && key !== 'ingestionIdentifier' && entry.length > 512))
    )
      return true
    if (key === 'properties' && isRecord(entry)) {
      if (Object.keys(entry).length > 64) return true
      if (Object.keys(entry).some((propertyKey) => propertyKey.length > 64)) return true
      if (
        Object.values(entry).some(
          (propertyValue) => typeof propertyValue === 'string' && propertyValue.length > 512,
        )
      )
        return true
    }
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
