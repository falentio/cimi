import { computed } from 'vue'
import { useQuery } from '@pinia/colada'
import type { CimiOrpc } from '~/plugins/orpc'
import type { WorkspaceSite, WorkspaceTeam } from '@/components/features/app-shell/workspace'

const PAGE_SIZE = 100

interface OffsetPage<TItem> {
  readonly items: readonly TItem[]
  readonly nextOffset: number | null
  readonly hasMore: boolean
}

interface WorkspaceData {
  readonly teams: readonly WorkspaceTeam[]
  readonly sites: readonly WorkspaceSite[]
}

type Organization = Awaited<
  ReturnType<CimiOrpc['organization']['listOrganizations']['call']>
>['items'][number]
type Site = Awaited<ReturnType<CimiOrpc['site']['listSites']['call']>>['items'][number]

export function useWorkspaceData() {
  const { session } = useAuth()
  const orpc = useOrpc()
  const enabled = computed(() => session.value.status === 'authenticated')
  const queryKey = computed(() => [
    'workspace',
    'sidebar',
    session.value.status === 'authenticated' ? session.value.session.user.id : null,
  ])

  const query = useQuery<WorkspaceData>({
    key: queryKey,
    enabled,
    query: ({ signal }) => loadWorkspaceData(orpc, signal),
  })

  const teams = computed<readonly WorkspaceTeam[]>(() => {
    return query.data.value?.teams ?? []
  })
  const sites = computed<readonly WorkspaceSite[]>(() => {
    return query.data.value?.sites ?? []
  })

  return {
    teams,
    sites,
    isLoading: query.isLoading,
    error: query.error,
    refresh: () => query.refetch(),
  }
}

async function loadWorkspaceData(orpc: CimiOrpc, signal: AbortSignal): Promise<WorkspaceData> {
  const organizations = await fetchAllPages((offset) =>
    orpc.organization.listOrganizations.call({ offset, limit: PAGE_SIZE }, { signal }),
  )
  const sitesByOrganization = await Promise.all(
    organizations.map((organization) =>
      fetchAllPages((offset) =>
        orpc.site.listSites.call(
          { organizationId: organization.id, offset, limit: PAGE_SIZE },
          { signal },
        ),
      ),
    ),
  )

  return {
    teams: organizations.map(toWorkspaceTeam),
    sites: sitesByOrganization.flat().map(toWorkspaceSite),
  }
}

async function fetchAllPages<TItem>(
  fetchPage: (offset: number) => Promise<OffsetPage<TItem>>,
): Promise<TItem[]> {
  const items: TItem[] = []
  let offset = 0

  while (true) {
    const page = await fetchPage(offset)
    items.push(...page.items)
    if (!page.hasMore || page.nextOffset === null) return items
    offset = page.nextOffset
  }
}

function toWorkspaceTeam(organization: Organization): WorkspaceTeam {
  return {
    id: organization.id,
    name: organization.name,
    isPersonal: organization.isPersonal,
  }
}

function toWorkspaceSite(site: Site): WorkspaceSite {
  return {
    id: site.id,
    teamId: site.organizationId,
    name: site.name,
    hostname: site.hostname,
  }
}
