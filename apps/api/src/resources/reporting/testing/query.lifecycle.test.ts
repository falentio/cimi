import { describe, expect, it } from 'vitest'
import {
  type AnalyticsReadinessPort,
  InMemoryLifecycleLock,
  ReportingAdmissionService,
  createInstantMs,
  type ReportingAdmissionDependencies,
  type ReportingEvidencePort,
  type ReportingMetadataPort,
  type RetentionCoverage,
} from '@cimi/kernel'
import { createReportQueryKernel } from '../query.ts'

describe('ReportQueryKernel.lifecycle', () => {
  it('holds the shared lifecycle boundary while a report reads data', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const admission = createAdmission()
    let deletionLease
    let responseDeletionLease
    const query = createReportQueryKernel({
      admission: admission.service,
      lifecycleLock,
      data: {
        read: async () => {
          deletionLease = lifecycleLock.acquire('site_deletion')
          return { events: [], sessions: [], activeProfiles: new Map() }
        },
      },
    })

    await expect(
      query.run({
        siteId: 'ste_1',
        window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
        plan: async ({ prepare }) => ({
          preparation: await prepare(),
          coverage: ['event-occurrence'],
          work: { extraMetricCount: 0, distinctCountOperations: 0 },
          identityKindFor: () => 'visitor',
          evaluate: () => 1,
        }),
        render: (run) => {
          responseDeletionLease = lifecycleLock.acquire('site_deletion')
          return run
        },
      }),
    ).resolves.toMatchObject({ current: { value: 1 } })

    expect(deletionLease).toBeUndefined()
    expect(responseDeletionLease).toBeUndefined()
    const deletionAfter = lifecycleLock.acquire('site_deletion')
    expect(deletionAfter).toBeDefined()
    await deletionAfter?.release()
  })

  it('completes while backup holds the compatible lifecycle lease', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const backupLease = lifecycleLock.acquire('backup')
    const admission = createAdmission()
    const query = createReportQueryKernel({
      admission: admission.service,
      lifecycleLock,
      data: { read: async () => ({ events: [], sessions: [], activeProfiles: new Map() }) },
    })

    await expect(
      query.run({
        siteId: 'ste_1',
        window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
        plan: async ({ prepare }) => ({
          preparation: await prepare(),
          coverage: ['event-occurrence'],
          work: { extraMetricCount: 0, distinctCountOperations: 0 },
          identityKindFor: () => 'visitor',
          evaluate: () => 1,
        }),
        render: (run) => run,
      }),
    ).resolves.toMatchObject({ current: { value: 1 } })

    expect(lifecycleLock.acquire('restore')).toBeUndefined()
    await backupLease?.release()
    expect(lifecycleLock.isLocked()).toBe(false)
  })

  it('fails closed when the shared lifecycle boundary is unavailable', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const lifecycleLease = lifecycleLock.acquire('site_deletion')
    if (lifecycleLease === undefined) throw new Error('Expected a lifecycle lease')
    const admission = createAdmission()
    const query = createReportQueryKernel({
      admission: admission.service,
      lifecycleLock,
      data: { read: async () => ({ events: [], sessions: [], activeProfiles: new Map() }) },
    })

    await expect(
      query.run({
        siteId: 'ste_1',
        window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
        plan: async () => {
          throw new Error('Planning must not run while lifecycle is locked')
        },
        render: (run) => run,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    expect(admission.reads).toEqual({ readiness: 0, metadata: 0, evidence: 0 })
    await lifecycleLease.release()
  })

  it('releases the shared lifecycle lease when report execution fails', async () => {
    const lifecycleLock = new InMemoryLifecycleLock()
    const admission = createAdmission()
    const query = createReportQueryKernel({
      admission: admission.service,
      lifecycleLock,
      data: {
        read: async () => {
          throw new Error('read failed')
        },
      },
    })

    await expect(
      query.run({
        siteId: 'ste_1',
        window: { fromDate: '2026-09-01', toDate: '2026-09-01' },
        plan: async ({ prepare }) => ({
          preparation: await prepare(),
          coverage: ['event-occurrence'],
          work: { extraMetricCount: 0, distinctCountOperations: 0 },
          identityKindFor: () => 'visitor',
          evaluate: () => 1,
        }),
        render: (run) => run,
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })

    const deletionLease = lifecycleLock.acquire('site_deletion')
    expect(deletionLease).toBeDefined()
    await deletionLease?.release()
  })
})

function createAdmission(): {
  readonly service: ReportingAdmissionService
  readonly reads: { readiness: number; metadata: number; evidence: number }
} {
  const reads = { readiness: 0, metadata: 0, evidence: 0 }
  const readiness: AnalyticsReadinessPort = {
    getHealth: () => {
      reads.readiness += 1
      return { controlStore: 'ready', analyticsStore: 'ready' }
    },
  }
  const metadata: ReportingMetadataPort = {
    getActive: (siteId) => {
      reads.metadata += 1
      return {
        siteId,
        reportingTimezone: 'UTC',
        weekStartsOn: 'monday',
      }
    },
  }
  const evidence: ReportingEvidencePort = {
    read: () => {
      reads.evidence += 1
      const occurrenceFrom = createInstantMs(Date.parse('2026-08-01T00:00:00.000Z'))
      const occurrenceThrough = createInstantMs(Date.parse('2026-09-02T00:00:00.000Z'))
      return {
        projection: {
          checkpoint: {
            projectedAcceptanceSequence: 1,
            projectedFactCardinality: 0,
            projectionGeneration: 1,
            occurrenceCoveredFrom: occurrenceFrom,
            occurrenceCoveredThrough: occurrenceThrough,
            statisticsRefreshedAt: createInstantMs(Date.parse('2026-09-01T00:00:00.000Z')),
          },
          openGaps: [],
        },
        retention: retentionCoverage(occurrenceFrom),
        statistics: { state: 'aligned', asOfAcceptanceSequence: 1, factCardinality: 0 },
      }
    },
  }
  const dependencies: ReportingAdmissionDependencies = {
    analyticsReadiness: readiness,
    metadata,
    evidence,
  }

  return { service: new ReportingAdmissionService(dependencies), reads }
}

function retentionCoverage(from: ReturnType<typeof createInstantMs>): RetentionCoverage {
  return {
    eventOccurrence: { state: 'available', from },
    profileActivity: { state: 'available', from },
    replayReceipt: { state: 'available', from },
  }
}
