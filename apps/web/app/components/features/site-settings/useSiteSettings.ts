import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { computed, shallowRef, toValue, watch } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'
import { useAuth } from '@/composables/useAuth'
import { useOrpc } from '@/composables/useOrpc'
import { normalizeSettingsError } from '../../../utils/settings-error'
import { normalizeSiteSettingsDraft, parseSiteId } from './site-settings.utils'
import type {
  Site,
  SiteDeletionAcceptance,
  SiteDeletionState,
  SiteId,
  SiteLoadState,
  SiteSaveState,
  SiteSettingsController,
  SiteSettingsDraft,
  SiteSettingsOptions,
  SiteSettingsSnapshot,
} from './site-settings.types'

const SITE_SETTINGS_QUERY_KEY = ['site-settings'] as const
const WORKSPACE_QUERY_KEY = ['workspace'] as const

export function useSiteSettings(options: SiteSettingsOptions): SiteSettingsController {
  const { session } = useAuth()
  const orpc = useOrpc()
  const queryCache = useQueryCache()
  const resolvedSiteId = computed(() => toValue(options.siteId))
  const authenticated = computed(() => session.value.status === 'authenticated')
  const currentUserId = computed(() => {
    const state = session.value
    return state.status === 'authenticated' ? state.session.user.id : undefined
  })
  const siteKey = computed(() => [
    ...SITE_SETTINGS_QUERY_KEY,
    currentUserId.value ?? null,
    resolvedSiteId.value ?? null,
  ])

  const siteQuery = useQuery<Site, unknown>({
    key: siteKey,
    enabled: computed(() => authenticated.value && resolvedSiteId.value !== undefined),
    query: ({ signal }) =>
      orpc.site.getSite.call({ siteId: requireSiteId(resolvedSiteId.value) }, { signal }),
  })
  const saveMutation = useMutation(orpc.site.updateSiteV2.mutationOptions())
  const deleteMutation = useMutation(orpc.site.deleteSite.mutationOptions())
  const saveState = shallowRef<SiteSaveState>({ status: 'idle' })
  const deletionState = shallowRef<SiteDeletionState>({ status: 'idle' })
  let contextVersion = 0

  watch([resolvedSiteId, currentUserId], () => {
    contextVersion += 1
    saveState.value = { status: 'idle' }
    deletionState.value = { status: 'idle' }
    saveMutation.reset()
    deleteMutation.reset()
  })

  const load = computed<SiteLoadState>(() => {
    const siteId = resolvedSiteId.value
    if (siteId === undefined) return { status: 'idle', siteId: undefined }

    const site = siteQuery.data.value
    const error = siteQuery.error.value
    if (site?.id === siteId) {
      if (siteQuery.isLoading.value) return { status: 'refreshing', site }
      if (error !== null) {
        return {
          status: 'stale-error',
          site,
          error: normalizeSettingsError(error, 'Site settings could not be refreshed.'),
        }
      }
      return { status: 'ready', site }
    }

    if (siteQuery.isLoading.value || error === null) return { status: 'loading', siteId }
    return {
      status: 'error',
      siteId,
      error: normalizeSettingsError(error, 'Site settings could not be loaded.'),
    }
  })

  const snapshot = computed<SiteSettingsSnapshot>(() => ({
    siteId: resolvedSiteId.value,
    load: load.value,
    save: saveState.value,
    deletion: deletionState.value,
  }))

  async function retry(): Promise<void> {
    await siteQuery.refetch()
  }

  async function save(draft: SiteSettingsDraft): Promise<Site> {
    const siteId = requireLoadedSiteId(load.value)
    const normalizedDraft = normalizeSiteSettingsDraft(draft)
    const operationContext = contextVersion
    saveMutation.reset()
    saveState.value = { status: 'saving', draft: normalizedDraft }

    let site: Site
    try {
      site = await saveMutation.mutateAsync({ siteId, ...normalizedDraft })
    } catch (error: unknown) {
      if (operationContext === contextVersion) {
        saveState.value = {
          status: 'error',
          draft: normalizedDraft,
          error: normalizeSettingsError(error, 'Site settings could not be saved.'),
        }
      }
      throw error
    }

    if (operationContext === contextVersion) saveState.value = { status: 'saved', site }

    try {
      await Promise.all([
        queryCache.invalidateQueries({ key: siteKey.value, exact: true }),
        queryCache.invalidateQueries({ key: WORKSPACE_QUERY_KEY }),
      ])
    } catch (error: unknown) {
      if (operationContext === contextVersion) {
        saveState.value = {
          status: 'saved',
          site,
          warning: normalizeSettingsError(error, 'Saved, but related views may be stale.'),
        }
      }
    }

    return site
  }

  function beginDelete(): void {
    if (deletionState.value.status === 'submitting') return
    deletionState.value = { status: 'confirming' }
  }

  function cancelDelete(): void {
    if (deletionState.value.status === 'submitting') return
    deletionState.value = { status: 'idle' }
  }

  async function confirmDelete(): Promise<SiteDeletionAcceptance> {
    if (deletionState.value.status !== 'confirming') {
      throw new Error('Confirm site deletion from the open dialog.')
    }

    const siteId = requireLoadedSiteId(load.value)
    const operationContext = contextVersion
    deleteMutation.reset()
    deletionState.value = { status: 'submitting' }

    let result: Awaited<ReturnType<CimiOrpc['site']['deleteSite']['call']>>
    try {
      result = await deleteMutation.mutateAsync({ siteId })
    } catch (error: unknown) {
      if (operationContext === contextVersion) {
        deletionState.value = {
          status: 'error',
          error: normalizeSettingsError(error, 'Site deletion could not be started.'),
        }
      }
      throw error
    }

    if (operationContext === contextVersion) {
      deletionState.value = { status: 'accepted', operationId: result.operationId }
    }

    try {
      await queryCache.invalidateQueries({ key: WORKSPACE_QUERY_KEY })
    } catch (error: unknown) {
      if (operationContext === contextVersion) {
        deletionState.value = {
          status: 'accepted',
          operationId: result.operationId,
          warning: normalizeSettingsError(
            error,
            'Deletion started, but the workspace may be stale.',
          ),
        }
      }
    }

    return { operationId: result.operationId }
  }

  return { snapshot, retry, save, beginDelete, cancelDelete, confirmDelete }
}

function requireSiteId(value: SiteId | undefined): SiteId {
  const siteId = parseSiteId(value)
  if (siteId === undefined) throw new Error('Choose a site before loading its settings.')
  return siteId
}

function requireLoadedSiteId(load: SiteLoadState): SiteId {
  if ('site' in load) return load.site.id
  throw new Error('Wait for site settings to load before changing this site.')
}
