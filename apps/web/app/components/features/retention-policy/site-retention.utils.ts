import type {
  ParsedRetentionDraft,
  RetentionPolicy,
  RetentionProposal,
} from './retention-policy.types'
import type {
  SiteRetentionProvenance,
  SiteRetentionState,
  SiteRetentionViewModel,
} from './site-retention.types'
import {
  draftFromPolicy,
  isRetentionDirty,
  isRetentionShortening,
  parseRetentionDraft,
  proposedPolicy,
  toRetentionCleanupProjection,
} from './retention-policy.utils'

export function siteRetentionProvenance(
  siteOverride: RetentionPolicy | null,
): SiteRetentionProvenance {
  return siteOverride === null ? 'installation-default' : 'site-override'
}

export function isProposalShortening(
  current: RetentionPolicy,
  proposal: RetentionProposal,
): boolean {
  return isRetentionShortening(current, proposedPolicy(proposal))
}

export function siteRetentionDisabledReason(input: {
  readonly stale: boolean
  readonly saving: boolean
  readonly dirty: boolean
  readonly validation: ParsedRetentionDraft
}): string | null {
  if (input.saving) return 'Saving retention settings.'

  if (input.stale) return 'Retention settings are stale. Refresh before saving.'

  if (input.validation.kind === 'invalid') return 'Fix the retention values before saving.'

  if (!input.dirty) return 'No changes to save.'

  return null
}

export function siteRetentionNotice(proposal: RetentionProposal): string {
  return proposal.kind === 'inherit'
    ? 'Site retention override cleared. This Site inherits the installation default again.'
    : 'Site retention override saved. This Site uses it instead of the installation default.'
}

export function toSiteRetentionView(state: SiteRetentionState): SiteRetentionViewModel {
  if (state.retention.kind === 'loading') {
    return { kind: 'loading', message: 'Loading Site retention settings.' }
  }

  if (state.retention.kind === 'failed') {
    if (
      state.retention.error.kind === 'authentication' ||
      state.retention.error.kind === 'forbidden'
    ) {
      return { kind: 'access-error', error: state.retention.error }
    }

    return { kind: 'error', error: state.retention.error }
  }

  const result = state.retention.result
  const draft = state.draft ?? draftFromPolicy(result.effectivePolicy)
  const validation = parseRetentionDraft(draft)
  const stale = state.retention.kind === 'stale'
  const saving = state.command.kind === 'submitting'
  const dirty = isRetentionDirty(result.effectivePolicy, draft)
  const canAttemptSubmit = dirty && !saving && !stale

  const shortening =
    validation.kind === 'valid' && isRetentionShortening(result.effectivePolicy, validation.policy)

  const clearShortens =
    result.siteOverride !== null &&
    isProposalShortening(result.effectivePolicy, {
      kind: 'inherit',
      installationDefault: result.installationDefault,
    })

  return {
    kind: 'ready',
    result,
    policy: {
      draft,
      siteOverride: result.siteOverride,
      installationDefault: result.installationDefault,
      effective: result.effectivePolicy,
      validation,
      dirty,
      shortening,
      saving,
      canAttemptSubmit,
      canSubmit: canAttemptSubmit && validation.kind === 'valid',
      hasOverride: result.siteOverride !== null,
      canClear: result.siteOverride !== null && !saving && !stale,
      clearShortens,
      disabledReason: siteRetentionDisabledReason({ stale, saving, dirty, validation }),
    },
    cleanup: toRetentionCleanupProjection(result.cleanup),
    provenance: siteRetentionProvenance(result.siteOverride),
    command: state.command,
    stale,
    retentionError: state.retention.kind === 'stale' ? state.retention.error : null,
    notice: state.notice,
    refreshing: isRefreshing(state.retention),
    announcement: buildAnnouncement(state),
  }
}

function isRefreshing(resource: SiteRetentionState['retention']): boolean {
  return resource.kind === 'ready' || resource.kind === 'stale' ? resource.refreshing : false
}

function buildAnnouncement(state: SiteRetentionState): string {
  if (state.notice !== null) return state.notice.message

  if (state.command.kind === 'submitting') return 'Saving Site retention settings.'

  if (state.retention.kind === 'stale') return state.retention.error.message

  if (state.retention.kind === 'ready' && state.retention.result.cleanup.pending) {
    return 'Cleanup is pending. Derived cleanup runs before historical backup cleanup.'
  }

  return ''
}
