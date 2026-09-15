import { computed, type ComputedRef } from 'vue'
import type { OrganizationId } from '@/components/features/organization-settings/organization-settings.types'
import { resolveActiveOrganizationId } from '@/components/features/organization-settings/organization-settings.utils'

export interface WorkspaceSelectionApi {
  readonly activeOrganizationId: Readonly<ComputedRef<OrganizationId | undefined>>
  readonly isLoading: Readonly<ComputedRef<boolean>>
  selectOrganization(organizationId: OrganizationId): void
  clearOrganization(organizationId: OrganizationId): void
}

export function useWorkspaceSelection(): WorkspaceSelectionApi {
  const route = useRoute()
  const router = useRouter()
  const workspace = useWorkspaceData()
  const selectedOrganizationId = useState<OrganizationId | undefined>(
    'workspace:selected-organization',
    () => undefined,
  )

  const routeSiteId = computed(() => {
    const value = route.params.siteId
    return typeof value === 'string' ? value : undefined
  })
  const urlOrganizationId = computed(() => {
    const value = route.query.organizationId
    return typeof value === 'string' ? value : undefined
  })
  const activeOrganizationId = computed(() =>
    resolveActiveOrganizationId({
      routeSiteId: routeSiteId.value,
      urlOrganizationId: urlOrganizationId.value,
      selectedOrganizationId: selectedOrganizationId.value,
      teams: workspace.teams.value,
      sites: workspace.sites.value,
    }),
  )

  function selectOrganization(organizationId: OrganizationId): void {
    selectedOrganizationId.value = organizationId
    const site = workspace.sites.value.find((candidate) => candidate.teamId === organizationId)
    if (site === undefined) {
      void router.push({ path: '/settings/general', query: { organizationId } })
      return
    }
    void router.push(`/sites/${site.id}`)
  }

  function clearOrganization(organizationId: OrganizationId): void {
    if (selectedOrganizationId.value === organizationId) selectedOrganizationId.value = undefined
  }

  return {
    activeOrganizationId,
    isLoading: computed(() => workspace.isLoading.value),
    selectOrganization,
    clearOrganization,
  }
}
