import { describe, expect, it } from 'vitest'
import { schema } from '@cimi/db'
import {
  createBackupDrizzleFixture,
  createBackupInsertInput,
  createSourceManifest,
} from './fixture.ts'
import type { RetentionManifest } from '../retention-manifest.ts'

describe('BackupRestoreRepositoryDrizzle.artifactRoundTrip', () => {
  it('round trips the retention manifest through artifact metadata', async () => {
    using fixture = createBackupDrizzleFixture()
    await fixture.insertInstallation()
    const operation = await fixture.repository.beginBackup(createBackupInsertInput())
    if (operation === undefined) throw new Error('expected backup operation')
    const retentionManifest: RetentionManifest = {
      version: 1,
      boundaries: [
        {
          siteId: 'site_1',
          installationId: 'ins_1',
          policyId: 'policy_1',
          reportingTimezone: 'UTC',
          localDay: '2026-09-01',
          eventOccurrenceCutoffAt: new Date('2026-08-01T00:00:00.000Z'),
          rawReceiptCutoffAt: new Date('2026-08-02T00:00:00.000Z'),
          profileActivityCutoffAt: new Date('2026-08-03T00:00:00.000Z'),
          replayReceiptCutoffAt: null,
          effectiveAt: new Date('2026-09-01T00:00:00.000Z'),
          updatedAt: new Date('2026-09-01T00:00:01.000Z'),
        },
      ],
    }
    await fixture.repository.recordBackupArtifact({
      operationId: operation.id,
      ownerToken: 'owner_1',
      artifact: createSourceManifest({ retentionManifest }),
      now: new Date('2026-09-01T00:00:01.000Z'),
    })

    const storedMetadata = fixture.db
      .select({ metadata: schema.TBackupArtifact.metadata })
      .from(schema.TBackupArtifact)
      .all()
    expect(storedMetadata).toEqual([
      {
        metadata: {
          retentionManifest: {
            version: 1,
            boundaries: [
              {
                siteId: 'site_1',
                installationId: 'ins_1',
                policyId: 'policy_1',
                reportingTimezone: 'UTC',
                localDay: '2026-09-01',
                eventOccurrenceCutoffAt: '2026-08-01T00:00:00.000Z',
                rawReceiptCutoffAt: '2026-08-02T00:00:00.000Z',
                profileActivityCutoffAt: '2026-08-03T00:00:00.000Z',
                replayReceiptCutoffAt: null,
                effectiveAt: '2026-09-01T00:00:00.000Z',
                updatedAt: '2026-09-01T00:00:01.000Z',
              },
            ],
          },
        },
      },
    ])

    await fixture.repository.complete({
      operationId: operation.id,
      ownerToken: 'owner_1',
      now: new Date('2026-09-01T00:00:02.000Z'),
    })
    await expect(fixture.repository.findSourceManifest(operation.id)).resolves.toMatchObject({
      retentionManifest,
    })
  })
})
