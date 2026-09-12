<script setup lang="ts">
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { isNavItemActive, type NavGroup } from './nav-config'

defineProps<{
  group: NavGroup
}>()

const route = useRoute()
</script>

<template>
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in group.items" :key="item.to">
          <SidebarMenuButton as-child size="sm" :is-active="isNavItemActive(route.path, item.to)">
            <NuxtLink :to="item.to">
              <HugeiconsIcon :icon="item.icon" :size="16" aria-hidden="true" />
              <span>{{ item.title }}</span>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
