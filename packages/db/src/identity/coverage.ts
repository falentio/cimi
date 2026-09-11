export interface IdentityCoverageLink {
  readonly siteId: string
  readonly profileId: string
  readonly profileEpoch: number
  readonly anonymousIdentityId: string
  readonly analyticsSessionId: string | null
  readonly effectiveFromMs: number
  readonly unlinkedAtMs: number | null
}

export interface IdentityCoverageEvent {
  readonly siteId: string
  readonly anonymousIdentityId: string | null
  readonly analyticsSessionId: string | null
  readonly receiptTimeMs: number
}

export interface IdentityRedactionTarget {
  readonly siteId: string
  readonly profileId: string
  readonly profileEpoch: number
}

export interface IdentityRedactionScope {
  readonly siteId: string
  readonly profileId: string
  readonly profileEpoch: number
}

export function linkCoversEvent(link: IdentityCoverageLink, event: IdentityCoverageEvent): boolean {
  return (
    link.siteId === event.siteId &&
    link.anonymousIdentityId === event.anonymousIdentityId &&
    (link.analyticsSessionId === null || link.analyticsSessionId === event.analyticsSessionId) &&
    link.effectiveFromMs <= event.receiptTimeMs &&
    (link.unlinkedAtMs === null || event.receiptTimeMs < link.unlinkedAtMs)
  )
}

export function isRedacted(
  redactions: readonly IdentityRedactionTarget[],
  scope: IdentityRedactionScope,
): boolean {
  return redactions.some(
    (redaction) =>
      redaction.siteId === scope.siteId &&
      redaction.profileId === scope.profileId &&
      redaction.profileEpoch === scope.profileEpoch,
  )
}
