import { describe, expect, it } from 'vitest'
import { mock } from 'vitest-mock-extended'
import type { AcceptanceRepository } from '../repository.ts'
import { AcceptanceAdmissionStoppedError, AcceptanceCoalescer } from '../coalescer.ts'

function candidate(eventId: string) {
  return {
    siteId: 'site-1',
    event: {
      eventId,
      occurrenceTime: '2026-09-05T00:00:00.000Z',
      identifiedUserId: null,
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
    },
    receiptTime: '2026-09-05T00:00:00.000Z',
    late: false,
    policyRevisionId: 'policy-1',
    payloadFingerprint: eventId,
    visitorId: null,
    analyticsSessionId: null,
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
    acceptance.append.mockResolvedValue()
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
    acceptance.append.mockResolvedValue()
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
    acceptance.append.mockResolvedValue()
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
})
