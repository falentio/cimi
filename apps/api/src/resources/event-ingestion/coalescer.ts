import {
  EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
  EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
  EVENT_ACCEPTANCE_WINDOW_MS,
} from '@cimi/contract'
import type { AcceptanceQuiescencePort } from '@cimi/kernel'
import type { AcceptanceCandidate, AcceptanceRepository } from './repository.ts'

export type ReservableCandidate = Omit<AcceptanceCandidate, 'replaySequence' | 'receiptTime'> & {
  readonly receiptTime?: string | undefined
}

export type Reservation =
  | {
      readonly status: 'accepted'
      readonly receiptTime: string
      readonly completion: Promise<void>
    }
  | {
      readonly status: 'duplicate'
      readonly receiptTime: string
      readonly completion: Promise<void>
    }
  | { readonly status: 'conflict' }
export class AcceptanceQueueSaturatedError extends Error {
  constructor() {
    super('Event acceptance queue is full')
    this.name = 'AcceptanceQueueSaturatedError'
  }
}

export class AcceptanceReservationConflictError extends Error {
  constructor(
    readonly siteId: string,
    readonly eventId: string,
  ) {
    super(`Acceptance reservation for ${eventId} conflicts with a durable record`)
    this.name = 'AcceptanceReservationConflictError'
  }
}

export class AcceptanceAdmissionStoppedError extends Error {
  constructor() {
    super('Event acceptance admission is stopped')
    this.name = 'AcceptanceAdmissionStoppedError'
  }
}

interface Deferred {
  readonly promise: Promise<void>
  resolve(): void
  reject(error: unknown): void
}

interface ReservationState {
  readonly candidate: AcceptanceCandidate
  readonly deferred: Deferred
  readonly reservedAt: number
}

export interface AcceptanceCoalescerDependencies {
  readonly repository: AcceptanceRepository
  readonly windowMs?: number
  readonly flushMaxEvents?: number
  readonly pendingMaxEvents?: number
  readonly schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  readonly cancel?: (timer: ReturnType<typeof setTimeout>) => void
  readonly clock?: (() => Date) | undefined
}

export interface AcceptanceDiagnosticsSnapshot {
  readonly queueDepth: number
  readonly activeBatchSize: number
  readonly pendingQueueSize: number
  readonly flushCount: number
  readonly committedCandidates: number
  readonly queueWaitMsTotal: number
  readonly commitLatencyMsTotal: number
  readonly responseLatencyMsTotal: number
  readonly responseCount: number
  readonly saturationCount: number
  readonly failureCount: number
  readonly lastSafeSequence: number
  readonly walBytes: number | null
}

export class AcceptanceCoalescer implements AcceptanceQuiescencePort {
  private readonly repository: AcceptanceRepository
  private readonly windowMs: number
  private readonly flushMaxEvents: number
  private readonly pendingMaxEvents: number
  private readonly schedule: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>
  private readonly cancel: (timer: ReturnType<typeof setTimeout>) => void
  private readonly clock: () => Date
  private readonly reservations = new Map<string, ReservationState>()
  private active: ReservationState[] = []
  private pending: ReservationState[] = []
  private flushPromise: Promise<void> | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private admissionStopped = false
  private sequence = 0
  private sequencePromise: Promise<void> | undefined
  private lastSafeSequence = 0
  private flushCount = 0
  private committedCandidates = 0
  private queueWaitMsTotal = 0
  private commitLatencyMsTotal = 0
  private responseLatencyMsTotal = 0
  private responseCount = 0
  private saturationCount = 0
  private failureCount = 0
  private draining = false

  constructor({
    repository,
    windowMs = EVENT_ACCEPTANCE_WINDOW_MS,
    flushMaxEvents = EVENT_ACCEPTANCE_FLUSH_MAX_EVENTS,
    pendingMaxEvents = EVENT_ACCEPTANCE_PENDING_MAX_EVENTS,
    schedule = (callback, delayMs) => setTimeout(callback, delayMs),
    cancel = clearTimeout,
    clock = () => new Date(),
  }: AcceptanceCoalescerDependencies) {
    this.repository = repository
    this.windowMs = windowMs
    this.flushMaxEvents = flushMaxEvents
    this.pendingMaxEvents = pendingMaxEvents
    this.schedule = schedule
    this.cancel = cancel
    this.clock = clock
  }

  async reserveMany(candidates: readonly ReservableCandidate[]): Promise<readonly Reservation[]> {
    if (this.admissionStopped) throw new AcceptanceAdmissionStoppedError()
    await this.ensureSequence()
    if (this.admissionStopped) throw new AcceptanceAdmissionStoppedError()

    const existing = new Map<string, ReservationState>()
    const planned = new Set<string>()
    const firstPlannedIndex = new Map<string, number>()
    const newCandidates: Array<{ candidate: ReservableCandidate; key: string }> = []
    for (const [index, candidate] of candidates.entries()) {
      const key = reservationKey(candidate.siteId, candidate.event.eventId)
      const reservation = this.reservations.get(key)
      if (reservation !== undefined) {
        existing.set(key, reservation)
        continue
      }
      if (planned.has(key)) {
        continue
      }
      firstPlannedIndex.set(key, index)
      planned.add(key)
      newCandidates.push({ candidate, key })
    }

    const available =
      this.flushPromise === undefined
        ? this.flushMaxEvents - this.active.length + this.pendingMaxEvents - this.pending.length
        : this.pendingMaxEvents - this.pending.length
    if (newCandidates.length > available) {
      this.saturationCount += 1
      throw new AcceptanceQueueSaturatedError()
    }

    const added = new Map<string, ReservationState>()
    for (const { candidate, key } of newCandidates) {
      const deferred = createDeferred()
      const acceptanceCandidate: AcceptanceCandidate = {
        ...candidate,
        receiptTime: candidate.receiptTime ?? this.clock().toISOString(),
        replaySequence: ++this.sequence,
      }
      const state = { candidate: acceptanceCandidate, deferred, reservedAt: Date.now() }
      this.reservations.set(key, state)
      added.set(key, state)
      if (this.flushPromise === undefined && this.active.length < this.flushMaxEvents) {
        this.active.push(state)
      } else {
        this.pending.push(state)
        if (this.pending.length === 1 && this.flushPromise !== undefined)
          this.startTimer(this.pending[0])
      }
    }

    const results: Reservation[] = []
    for (const [index, candidate] of candidates.entries()) {
      const key = reservationKey(candidate.siteId, candidate.event.eventId)
      const existingReservation = existing.get(key)
      const state = existingReservation ?? added.get(key)
      if (state !== undefined) {
        results.push(
          state.candidate.payloadFingerprint === candidate.payloadFingerprint
            ? {
                status: firstPlannedIndex.get(key) === index ? 'accepted' : 'duplicate',
                receiptTime: state.candidate.receiptTime,
                completion: state.deferred.promise,
              }
            : { status: 'conflict' },
        )
        continue
      }
      results.push({ status: 'conflict' })
    }

    if (this.active.length > 0 && this.flushPromise === undefined && this.timer === undefined) {
      this.startTimer(this.active[0])
    }
    if (this.active.length >= this.flushMaxEvents) void this.flushActive().catch(() => undefined)
    return results
  }

  async flush(): Promise<void> {
    this.clearTimer()
    await this.flushActive()
  }

  async stop(): Promise<void> {
    this.stopAdmission()
    await this.drain()
  }

  stopAdmission(): void {
    this.admissionStopped = true
    this.clearTimer()
  }

  async drain(): Promise<{ readonly lastSafeSequence: number }> {
    this.clearTimer()
    this.draining = true
    try {
      while (this.active.length > 0 || this.pending.length > 0 || this.flushPromise !== undefined) {
        if (this.flushPromise !== undefined) {
          await this.flushPromise
        } else {
          await this.flushActive()
        }
      }
    } catch (error) {
      this.rejectQueued(error)
      throw error
    } finally {
      this.draining = false
    }
    return { lastSafeSequence: this.lastSafeSequence }
  }

  resumeAdmission(): void {
    this.admissionStopped = false
  }

  get queueDepth(): number {
    return this.active.length + this.pending.length
  }

  get diagnostics(): AcceptanceDiagnosticsSnapshot {
    return {
      queueDepth: this.queueDepth,
      activeBatchSize: this.active.length,
      pendingQueueSize: this.pending.length,
      flushCount: this.flushCount,
      committedCandidates: this.committedCandidates,
      queueWaitMsTotal: this.queueWaitMsTotal,
      commitLatencyMsTotal: this.commitLatencyMsTotal,
      responseLatencyMsTotal: this.responseLatencyMsTotal,
      responseCount: this.responseCount,
      saturationCount: this.saturationCount,
      failureCount: this.failureCount,
      lastSafeSequence: this.lastSafeSequence,
      walBytes: this.repository.walBytes?.() ?? null,
    }
  }

  pendingReservation(
    siteId: string,
    eventId: string,
    payloadFingerprint: string,
  ): Reservation | undefined {
    const state = this.reservations.get(reservationKey(siteId, eventId))
    if (state === undefined) return undefined
    if (state.candidate.payloadFingerprint !== payloadFingerprint) return { status: 'conflict' }
    return {
      status: 'duplicate',
      receiptTime: state.candidate.receiptTime,
      completion: state.deferred.promise,
    }
  }

  private async ensureSequence(): Promise<void> {
    if (this.sequencePromise === undefined) {
      this.sequencePromise = this.repository
        .lastReplaySequence()
        .then((sequence) => {
          this.sequence = sequence
          this.lastSafeSequence = sequence
        })
        .catch((error: unknown) => {
          this.sequencePromise = undefined
          throw error
        })
    }
    await this.sequencePromise
  }

  private startTimer(firstQueued?: ReservationState): void {
    this.clearTimer()
    if (firstQueued === undefined) return
    const elapsed = Date.now() - firstQueued.reservedAt
    this.timer = this.schedule(
      () => {
        this.timer = undefined
        void this.flushActive().catch(() => undefined)
      },
      Math.max(0, this.windowMs - elapsed),
    )
    this.timer.unref?.()
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    this.cancel(this.timer)
    this.timer = undefined
  }

  private async flushActive(): Promise<void> {
    if (this.flushPromise !== undefined || this.active.length === 0) {
      await this.flushPromise
      if (this.active.length > 0 && this.flushPromise === undefined) await this.flushActive()
      return
    }
    this.clearTimer()
    const batch = this.active.splice(0, this.flushMaxEvents)
    const startedAt = Date.now()
    this.flushCount += 1
    this.queueWaitMsTotal += batch.reduce((total, state) => total + startedAt - state.reservedAt, 0)
    let succeeded = false
    const flush = this.repository
      .append(batch.map(({ candidate }) => candidate))
      .then((outcomes) => {
        succeeded = true
        const committedAt = Date.now()
        this.commitLatencyMsTotal += committedAt - startedAt
        let acceptedCount = 0
        let lastAcceptedSequence = this.lastSafeSequence
        for (const [index, state] of batch.entries()) {
          const outcome = outcomes[index]
          if (outcome === undefined) throw new Error('Acceptance outcome count mismatch')
          if (outcome.status === 'conflict') {
            state.deferred.reject(
              new AcceptanceReservationConflictError(
                state.candidate.siteId,
                state.candidate.event.eventId,
              ),
            )
            continue
          }
          if (outcome.status === 'accepted') {
            acceptedCount += 1
            lastAcceptedSequence = state.candidate.replaySequence
          }
          this.responseLatencyMsTotal += committedAt - state.reservedAt
          this.responseCount += 1
          state.deferred.resolve()
        }
        this.committedCandidates += acceptedCount
        this.lastSafeSequence = lastAcceptedSequence
      })
      .catch((error: unknown) => {
        this.failureCount += 1
        for (const state of batch) state.deferred.reject(error)
        throw error
      })
      .finally(() => {
        for (const state of batch)
          this.reservations.delete(
            reservationKey(state.candidate.siteId, state.candidate.event.eventId),
          )
        this.flushPromise = undefined
        if (succeeded || !this.draining) this.activatePending()
        if (!this.draining && this.active.length > 0) {
          if (this.active.length >= this.flushMaxEvents)
            void this.flushActive().catch(() => undefined)
          else this.startTimer(this.active[0])
        }
      })
    this.flushPromise = flush
    await flush
  }

  private activatePending(): void {
    const next = this.pending.splice(0, this.flushMaxEvents - this.active.length)
    this.active.push(...next)
  }

  private rejectQueued(error: unknown): void {
    for (const state of [...this.active, ...this.pending]) {
      state.deferred.reject(error)
      this.reservations.delete(
        reservationKey(state.candidate.siteId, state.candidate.event.eventId),
      )
    }
    this.active = []
    this.pending = []
  }
}

function reservationKey(siteId: string, eventId: string): string {
  return `${siteId}\u0000${eventId}`
}

function createDeferred(): Deferred {
  let resolvePromise: () => void = () => undefined
  let rejectPromise: (error: unknown) => void = () => undefined
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  }
}
