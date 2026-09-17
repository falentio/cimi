<script setup lang="ts">
import { Globe02Icon } from '@hugeicons/core-free-icons'
import type { SidebarProps } from '@/components/ui/sidebar'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { NAV_REGISTRY, type NavGroup } from './nav-config'
import { createOrganizationNav, siteOverviewPath } from './organization-nav-config'
import NavMain from './NavMain.vue'
import NavProjects from './NavProjects.vue'
import NavSecondary from './NavSecondary.vue'
import NavUser from './NavUser.vue'
import { createSiteSectionNav } from './site-nav-config'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
  variant: 'inset',
})

const { session } = useAuth()
const route = useRoute()
const router = useRouter()
const { teams, sites, isLoading, error, refresh } = useWorkspaceData()
const { activeOrganizationId, selectOrganization: selectWorkspaceOrganization } =
  useWorkspaceSelection()

const routeSiteId = computed<string | undefined>(() => {
  const value = route.params.siteId
  return typeof value === 'string' ? value : undefined
})

const routeOrganizationId = computed<string | undefined>(() => {
  const value = route.params.organizationId
  return typeof value === 'string' ? value : undefined
})

const isOrganizationRoute = computed(() => route.path === '/org' || route.path.startsWith('/org/'))

const isAdmin = computed(() => {
  const state = session.value
  return state.status === 'authenticated' && state.session.user.role === 'admin'
})

const secondary = computed(() => ({
  ...NAV_REGISTRY.secondary,
  items: NAV_REGISTRY.secondary.items.filter((item) => !item.admin || isAdmin.value),
}))

const activeSiteId = computed(() => {
  if (isOrganizationRoute.value) return undefined
  if (
    routeSiteId.value !== undefined &&
    sites.value.some((site) => site.id === routeSiteId.value)
  ) {
    return routeSiteId.value
  }
  return sites.value[0]?.id
})

const activeTeamId = computed(() => {
  if (isOrganizationRoute.value) return routeOrganizationId.value ?? ''
  if (activeOrganizationId.value !== undefined) return activeOrganizationId.value
  const activeSite = sites.value.find((site) => site.id === activeSiteId.value)
  return activeSite?.teamId ?? teams.value[0]?.id ?? ''
})

const activeOrganization = computed(() => {
  const organizationId = isOrganizationRoute.value
    ? routeOrganizationId.value
    : activeOrganizationId.value
  return teams.value.find((team) => team.id === organizationId)
})

const organizationNav = computed<NavGroup | undefined>(() => {
  const organization = activeOrganization.value
  if (organization === undefined) return undefined
  return createOrganizationNav({ organizationId: organization.id, label: organization.name })
})

const siteNav = computed<NavGroup>(() => ({
  label: 'Sites',
  items: sites.value.map((site) => ({
    title: site.name,
    to: siteOverviewPath(site.id),
    icon: Globe02Icon,
  })),
}))

const siteSectionNav = computed<NavGroup | undefined>(() => {
  const siteId = routeSiteId.value
  if (siteId === undefined) return undefined

  const site = sites.value.find((candidate) => candidate.id === siteId)
  return createSiteSectionNav({ siteId, label: site?.name ?? siteId })
})

function selectOrganization(organizationId: string): void {
  selectWorkspaceOrganization(organizationId)
}

function selectSite(siteId: string): void {
  const site = sites.value.find((candidate) => candidate.id === siteId)
  if (site === undefined) return
  void router.push(siteOverviewPath(site.id))
}

const user = computed(() => {
  if (session.value.status !== 'authenticated') {
    return {
      name: 'Cimi user',
      email: 'Authenticated',
      avatar: '',
    }
  }

  return {
    name: session.value.session.user.name,
    email: session.value.session.user.email,
    avatar: session.value.session.user.image ?? '',
  }
})
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <WorkspaceSwitcher
        :teams="teams"
        :sites="sites"
        :active-team-id="activeTeamId"
        :active-site-id="activeSiteId"
        @team-change="selectOrganization"
        @site-change="selectSite"
      />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :group="NAV_REGISTRY.main" />
      <NavProjects v-if="organizationNav !== undefined" :group="organizationNav" />
      <NavProjects v-if="siteNav.items.length > 0" :group="siteNav" />
      <NavProjects v-if="siteSectionNav !== undefined" :group="siteSectionNav" />
      <NavSecondary :group="secondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
  </Sidebar>
</template>
