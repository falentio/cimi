import { computed } from 'vue'
import { normalizeSettingsError } from '@/components/features/organization-settings/organization-settings.utils'
import type { OrganizationHomeController } from './organization-home.types'
import { deriveOrganizationHomeState, parseOrganizationId } from './organization-home.utils'

export function useOrganizationHome(): OrganizationHomeController {
  const route = useRoute()
  const workspace = useWorkspaceData()

  const organizationId = computed(() => parseOrganizationId(route.params.organizationId))
  const error = computed(() => {
    const value = workspace.error.value
    return value == null
      ? undefined
      : normalizeSettingsError(value, 'Workspace data could not be loaded')
  })
  const state = computed(() =>
    deriveOrganizationHomeState({
      organizationId: organizationId.value,
      teams: workspace.teams.value,
      sites: workspace.sites.value,
      isLoading: workspace.isLoading.value,
      error: error.value,
    }),
  )

  async function refresh(): Promise<void> {
    await workspace.refresh()
  }

  return { state, refresh }
}
