export type CleanupKind = 'derived' | 'backup'

export interface SiteRetentionBoundary {
  siteId: string
  installationId: string
  policyId: string
  reportingTimezone: string
  localDay: string
  eventOccurrenceCutoffAt: Date
  rawReceiptCutoffAt: Date
  profileActivityCutoffAt: Date
  replayReceiptCutoffAt: Date | null
  effectiveAt: Date
  updatedAt: Date
}

export interface CleanupCheckpoint {
  id: string
  dataClass: string
  stage: CleanupKind
  cursor: string | null
  processedThrough: Date | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  updatedAt: Date
}
