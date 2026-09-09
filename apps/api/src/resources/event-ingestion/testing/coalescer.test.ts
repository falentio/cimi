import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AcceptanceRepository, AppendOutcome } from '../repository.ts'
import {
  AcceptanceAdmissionStoppedError,
  AcceptanceCoalescer,
  AcceptanceQueueSaturatedError,
} from '../coalescer.ts'

function candidate(eventId: string) {
  return {
    siteId: 'site-1',
    event: {
      eventId,
      occurrenceTime: '2026-09-05T00:00:00.000Z',
      identifiedUserId: null,
      anonymousIdentityId: null,
      properties: {},
      kind: 'custom_event' as const,
      name: 'checkout',
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      deviceType: null,
      browser: null,
      os: null,
      country: null,
      botPolicyOutcome: 'included' as const,
    },
    receiptTime: '2026-09-05T00:00:00.000Z',
    late: false,
    policyRevisionId: 'policy-1',
    payloadFingerprint: eventId,
    visitorId: null,
    analyticsSessionId: null,
  }
}

function pageViewCandidate(eventId: string, pageViewId: string) {
  const base = candidate(eventId)
  return {
    ...base,
    event: {
      ...base.event,
      kind: 'page_view' as const,
      pageViewId,
      pagePath: '/',
      referrer: null,
    },
  }
}

describe('AcceptanceCoalescer', () => {
  it('does not admit a request waiting for sequence initialization after quiescence', async () => {
    const acceptance = mock<AcceptanceRepository>()
    let resolveSequence!: (sequence: number) => void
    acceptance.lastReplaySequence.mockReturnValue(
      new Promise((resolve) => {
        resolveSequence = resolve
      }),
    )
    const coalescer = new AcceptanceCoalescer({ repository: acceptance })

    const reservation = coalescer.reserveMany([candidate('event-1')])
    coalescer.stopAdmission()
    resolveSequence(0)

    await expect(reservation).rejects.toBeInstanceOf(AcceptanceAdmissionStoppedError)
    expect(acceptance.append).not.toHaveBeenCalled()
  })

  it('reports queue, flush, failure, and saturation diagnostics', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    acceptance.append.mockImplementation(async (candidates) =>
      candidates.map(() => ({ status: 'accepted' }) as AppendOutcome),
    )
    const coalescer = new AcceptanceCoalescer({
      repository: acceptance,
      flushMaxEvents: 1,
      pendingMaxEvents: 0,
    })

    const first = coalescer.reserveMany([candidate('event-1')])
    await coalescer.flush()
    await first

    expect(coalescer.diagnostics).toMatchObject({
      queueDepth: 0,
      flushCount: 1,
      committedCandidates: 1,
      lastSafeSequence: 1,
      saturationCount: 0,
      failureCount: 0,
    })
    await coalescer.stop()
  })

  it('flushes a multi-event active queue when its window expires', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    acceptance.append.mockImplementation(async (candidates) =>
      candidates.map(() => ({ status: 'accepted' }) as AppendOutcome),
    )
    const coalescer = new AcceptanceCoalescer({ repository: acceptance, windowMs: 1 })

    const reservations = await coalescer.reserveMany([candidate('event-1'), candidate('event-2')])
    await Promise.all(
      reservations.map((reservation) =>
        'completion' in reservation ? reservation.completion : Promise.resolve(),
      ),
    )

    expect(acceptance.append).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ event: expect.objectContaining({ eventId: 'event-1' }) }),
        expect.objectContaining({ event: expect.objectContaining({ eventId: 'event-2' }) }),
      ]),
    )
    await coalescer.stop()
  })

  it('retries sequence initialization after a transient failure', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence
      .mockRejectedValueOnce(new Error('sqlite unavailable'))
      .mockResolvedValueOnce(4)
    acceptance.append.mockImplementation(async (candidates) =>
      candidates.map(() => ({ status: 'accepted' }) as AppendOutcome),
    )
    const coalescer = new AcceptanceCoalescer({ repository: acceptance })

    await expect(coalescer.reserveMany([candidate('event-1')])).rejects.toThrow(
      'sqlite unavailable',
    )
    const reservations = await coalescer.reserveMany([candidate('event-2')])
    await coalescer.flush()
    const reservation = reservations[0]
    if (reservation !== undefined && 'completion' in reservation) await reservation.completion

    expect(acceptance.lastReplaySequence).toHaveBeenCalledTimes(2)
    expect(acceptance.append).toHaveBeenCalledWith([expect.objectContaining({ replaySequence: 5 })])
    await coalescer.stop()
  })

  it('does not start a second flush after drain failure', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    acceptance.append.mockRejectedValueOnce(new Error('sqlite unavailable'))
    const coalescer = new AcceptanceCoalescer({
      repository: acceptance,
      flushMaxEvents: 1,
      pendingMaxEvents: 1,
    })

    const reservations = await coalescer.reserveMany([candidate('event-1'), candidate('event-2')])
    await expect(coalescer.stop()).rejects.toThrow('sqlite unavailable')
    await expect(
      'completion' in reservations[0]! ? reservations[0].completion : Promise.resolve(),
    ).rejects.toThrow('sqlite unavailable')
    await expect(
      'completion' in reservations[1]! ? reservations[1].completion : Promise.resolve(),
    ).rejects.toThrow('sqlite unavailable')
    expect(acceptance.append).toHaveBeenCalledTimes(1)
  })

  it('continues the next queue window from its first candidate arrival after a flush', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    const appendResolvers: Array<(outcomes: readonly AppendOutcome[]) => void> = []
    let now = new Date('2026-09-05T00:00:00.000Z')
    acceptance.append.mockImplementation(
      (candidates) =>
        new Promise<readonly AppendOutcome[]>((resolve) => {
          appendResolvers.push(() =>
            resolve(candidates.map(() => ({ status: 'accepted' }) as const)),
          )
        }),
    )
    const schedules: Array<{ callback: () => void; delayMs: number }> = []
    const coalescer = new AcceptanceCoalescer({
      repository: acceptance,
      flushMaxEvents: 3,
      pendingMaxEvents: 2,
      windowMs: 1000,
      schedule: (callback, delayMs) => {
        const token = setTimeout(() => undefined, 60_000)
        schedules.push({ callback, delayMs })
        return token
      },
      clock: () => now,
    })

    await coalescer.reserveMany([candidate('event-1')])
    const flushing = coalescer.flush()
    await coalescer.reserveMany([candidate('event-2')])
    await coalescer.reserveMany([candidate('event-3')])
    expect(schedules).toHaveLength(2)
    expect(appendResolvers).toHaveLength(1)
    now = new Date(now.getTime() + 1)
    appendResolvers[0]?.([])
    await flushing
    expect(schedules).toHaveLength(3)
    const resumed = schedules[2]
    expect(resumed?.delayMs).toBeGreaterThan(0)
    expect(resumed?.delayMs).toBeLessThan(1000)

    resumed?.callback()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(acceptance.append).toHaveBeenCalledTimes(2)
    expect(acceptance.append).toHaveBeenLastCalledWith([
      expect.objectContaining({ event: expect.objectContaining({ eventId: 'event-2' }) }),
      expect.objectContaining({ event: expect.objectContaining({ eventId: 'event-3' }) }),
    ])
    expect(schedules).toHaveLength(3)
    appendResolvers[1]?.([])
    await coalescer.stop()
  })

  it('rejects admission beyond the 500 active and 1500 pending queue limits', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    acceptance.append.mockImplementation(
      () => new Promise<readonly AppendOutcome[]>(() => undefined),
    )
    const coalescer = new AcceptanceCoalescer({
      repository: acceptance,
      flushMaxEvents: 500,
      pendingMaxEvents: 1500,
      windowMs: 60_000,
      schedule: () => setTimeout(() => undefined, 3_600_000),
    })
    const batch = (offset: number, size: number) =>
      Array.from({ length: size }, (_, index) => candidate(`event-${offset + index}`))

    const first = await coalescer.reserveMany(batch(0, 500))
    const second = await coalescer.reserveMany(batch(500, 1500))
    await expect(coalescer.reserveMany(batch(2000, 1))).rejects.toBeInstanceOf(
      AcceptanceQueueSaturatedError,
    )
    expect(first).toHaveLength(500)
    expect(second).toHaveLength(1500)
    expect(coalescer.diagnostics.saturationCount).toBe(1)
    coalescer.stopAdmission()
  })

  it('releases pageview reservations by pageview ID after a failed flush', async () => {
    const acceptance = mock<AcceptanceRepository>()
    acceptance.lastReplaySequence.mockResolvedValue(0)
    acceptance.append
      .mockRejectedValueOnce(new Error('sqlite unavailable'))
      .mockImplementation(async (candidates) =>
        candidates.map(() => ({ status: 'accepted' }) as AppendOutcome),
      )
    const coalescer = new AcceptanceCoalescer({ repository: acceptance })

    const failed = await coalescer.reserveMany([pageViewCandidate('event-1', 'page-1')])
    const failedCompletion = failed[0]
    if (failedCompletion !== undefined && 'completion' in failedCompletion)
      failedCompletion.completion.catch(() => undefined)
    await expect(coalescer.flush()).rejects.toThrow('sqlite unavailable')

    const retry = await coalescer.reserveMany([pageViewCandidate('event-2', 'page-1')])
    expect(retry[0]).toMatchObject({ status: 'accepted' })
    await coalescer.flush()
    if (retry[0] !== undefined && 'completion' in retry[0]) await retry[0].completion
    await coalescer.stop()
  })
})
