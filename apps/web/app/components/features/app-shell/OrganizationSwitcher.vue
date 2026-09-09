<script setup lang="ts">
import { ref } from 'vue'
import {
  ArrowDown01Icon,
  DashboardSquare01Icon,
  Folder01Icon,
  Home01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'

const organizations = [
  { name: 'Cimi', logo: Home01Icon, plan: 'Enterprise' },
  { name: 'Northstar', logo: DashboardSquare01Icon, plan: 'Growth' },
  { name: 'Atlas', logo: Folder01Icon, plan: 'Free' },
]

const { isMobile } = useSidebar()
const activeOrganization = ref(organizations[0]!)
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <SidebarMenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <span
              class="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg"
            >
              <HugeiconsIcon :icon="activeOrganization.logo" :size="16" aria-hidden="true" />
            </span>
            <span class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{ activeOrganization.name }}</span>
              <span class="truncate text-xs">{{ activeOrganization.plan }}</span>
            </span>
            <HugeiconsIcon :icon="ArrowDown01Icon" :size="16" class="ml-auto" aria-hidden="true" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
          align="start"
          :side="isMobile ? 'bottom' : 'right'"
          :side-offset="4"
        >
          <DropdownMenuLabel class="text-muted-foreground text-xs">Organizations</DropdownMenuLabel>
          <DropdownMenuItem
            v-for="(organization, index) in organizations"
            :key="organization.name"
            class="gap-2 p-2"
            @click="activeOrganization = organization"
          >
            <span class="flex size-6 items-center justify-center rounded-sm border">
              <HugeiconsIcon :icon="organization.logo" :size="14" aria-hidden="true" />
            </span>
            <span>{{ organization.name }}</span>
            <DropdownMenuShortcut>⌘{{ index + 1 }}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem class="gap-2 p-2">
            <span class="flex size-6 items-center justify-center rounded-md border">
              <span class="text-base leading-none" aria-hidden="true">+</span>
            </span>
            <span class="text-muted-foreground font-medium">Add organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
