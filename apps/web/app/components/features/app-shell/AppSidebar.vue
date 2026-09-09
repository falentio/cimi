<script setup lang="ts">
import {
  DashboardSquare01Icon,
  Folder01Icon,
  HelpCircleIcon,
  Home01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import type { SidebarProps } from '@/components/ui/sidebar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import NavMain from './NavMain.vue'
import NavProjects from './NavProjects.vue'
import NavSecondary from './NavSecondary.vue'
import NavUser from './NavUser.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: 'inset',
})

const { session } = useAuth()

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

const data = {
  navMain: [
    {
      title: 'Playground',
      url: '/app',
      icon: Home01Icon,
      isActive: true,
      items: [
        { title: 'History', url: '#' },
        { title: 'Starred', url: '#' },
        { title: 'Settings', url: '#' },
      ],
    },
    {
      title: 'Models',
      url: '#',
      icon: DashboardSquare01Icon,
      items: [
        { title: 'Genesis', url: '#' },
        { title: 'Explorer', url: '#' },
        { title: 'Quantum', url: '#' },
      ],
    },
    {
      title: 'Documentation',
      url: '#',
      icon: Folder01Icon,
      items: [
        { title: 'Introduction', url: '#' },
        { title: 'Get Started', url: '#' },
        { title: 'Tutorials', url: '#' },
        { title: 'Changelog', url: '#' },
      ],
    },
    {
      title: 'Settings',
      url: '#',
      icon: Settings01Icon,
      items: [
        { title: 'General', url: '#' },
        { title: 'Team', url: '#' },
        { title: 'Billing', url: '#' },
        { title: 'Limits', url: '#' },
      ],
    },
  ],
  navSecondary: [
    { title: 'Support', url: '#', icon: HelpCircleIcon },
    { title: 'Feedback', url: '#', icon: HelpCircleIcon },
  ],
  projects: [
    { name: 'Design Engineering', url: '#', icon: Folder01Icon },
    { name: 'Sales & Marketing', url: '#', icon: Folder01Icon },
    { name: 'Travel', url: '#', icon: Folder01Icon },
  ],
}
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <NuxtLink to="/app">
              <span
                class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
              >
                <span class="text-sm font-semibold">C</span>
              </span>
              <span class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">Cimi</span>
                <span class="truncate text-xs">Workspace</span>
              </span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="data.navMain" />
      <NavProjects :projects="data.projects" />
      <NavSecondary :items="data.navSecondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="user" />
    </SidebarFooter>
  </Sidebar>
</template>
