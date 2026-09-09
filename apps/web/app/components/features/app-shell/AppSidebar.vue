<script setup lang="ts">
import type { SidebarProps } from '@/components/ui/sidebar'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from '@/components/ui/sidebar'
import { NAV_REGISTRY } from './nav-config'
import NavMain from './NavMain.vue'
import NavProjects from './NavProjects.vue'
import NavSecondary from './NavSecondary.vue'
import NavUser from './NavUser.vue'
import OrganizationSwitcher from './OrganizationSwitcher.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  collapsible: 'icon',
  variant: 'inset',
})

const { session } = useAuth()

const isAdmin = computed(() => {
  const state = session.value
  return state.status === 'authenticated' && state.session.user.role === 'admin'
})

const secondary = computed(() => ({
  ...NAV_REGISTRY.secondary,
  items: NAV_REGISTRY.secondary.items.filter((item) => !item.admin || isAdmin.value),
}))

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
      <OrganizationSwitcher />
    </SidebarHeader>
    <SidebarContent>
      <NavMain :group="NAV_REGISTRY.main" />
      <NavProjects :group="NAV_REGISTRY.sites" />
      <NavSecondary :group="secondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
  </Sidebar>
</template>
