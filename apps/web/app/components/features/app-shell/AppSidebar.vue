<script setup lang="ts">
import { Globe02Icon } from '@hugeicons/core-free-icons'
import type { SidebarProps } from '@/components/ui/sidebar'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { NAV_REGISTRY, type NavGroup } from './nav-config'
import NavMain from './NavMain.vue'
import NavProjects from './NavProjects.vue'
import NavSecondary from './NavSecondary.vue'
import NavUser from './NavUser.vue'
import WorkspaceSwitcher from './WorkspaceSwitcher.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
  variant: 'inset',
})

const { session } = useAuth()
const route = useRoute()
const router = useRouter()
const { teams, sites, isLoading, error, refresh } = useWorkspaceData()

const isAdmin = computed(() => {
  const state = session.value
  return state.status === 'authenticated' && state.session.user.role === 'admin'
})

const secondary = computed(() => ({
  ...NAV_REGISTRY.secondary,
  items: NAV_REGISTRY.secondary.items.filter((item) => !item.admin || isAdmin.value),
}))

const activeSiteId = computed(() => {
  const routeSiteId = route.params.siteId
  if (typeof routeSiteId === 'string' && sites.value.some((site) => site.id === routeSiteId))
    return routeSiteId
  return sites.value[0]?.id
})

const activeTeamId = computed(() => {
  const activeSite = sites.value.find((site) => site.id === activeSiteId.value)
  return activeSite?.teamId ?? teams.value[0]?.id ?? ''
})

const siteNav = computed<NavGroup>(() => ({
  label: 'Sites',
  items: sites.value.map((site) => ({
    title: site.name,
    to: `/sites/${site.id}`,
    icon: Globe02Icon,
  })),
}))

function selectOrganization(organizationId: string): void {
  const siteId = sites.value.find((site) => site.teamId === organizationId)?.id
  if (siteId !== undefined) void router.push(`/sites/${siteId}`)
}

function selectSite(siteId: string): void {
  const site = sites.value.find((candidate) => candidate.id === siteId)
  if (site === undefined) return
  void router.push(`/sites/${site.id}`)
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
      <NavProjects v-if="siteNav.items.length > 0" :group="siteNav" />
      <NavSecondary :group="secondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
  </Sidebar>
</template>
