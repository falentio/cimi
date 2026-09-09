<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  DashboardSquare01Icon,
  Folder01Icon,
  HelpCircleIcon,
  Home01Icon,
  Settings01Icon,
} from '@hugeicons/core-free-icons'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import NavUser from './NavUser.vue'

const mainNavigation = [
  { label: 'Overview', href: '/app', icon: Home01Icon },
  { label: 'Dashboard', href: '#', icon: DashboardSquare01Icon },
  { label: 'Resources', href: '#', icon: Folder01Icon },
]

const secondaryNavigation = [
  { label: 'Settings', href: '#', icon: Settings01Icon },
  { label: 'Help & support', href: '#', icon: HelpCircleIcon },
]
</script>

<template>
  <Sidebar variant="inset" collapsible="icon">
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
                <span class="truncate font-semibold">Cimi</span>
                <span class="text-muted-foreground truncate text-xs">Workspace</span>
              </span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in mainNavigation" :key="item.label">
              <SidebarMenuButton as-child :is-active="item.href === '/app'">
                <NuxtLink :to="item.href">
                  <HugeiconsIcon :icon="item.icon" :size="16" aria-hidden="true" />
                  <span>{{ item.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in secondaryNavigation" :key="item.label">
              <SidebarMenuButton as-child>
                <a :href="item.href">
                  <HugeiconsIcon :icon="item.icon" :size="16" aria-hidden="true" />
                  <span>{{ item.label }}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <NavUser />
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>
</template>
