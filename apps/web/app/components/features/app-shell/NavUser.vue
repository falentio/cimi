<script setup lang="ts">
import { computed } from 'vue'
import { UserCircle02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

const { session } = useAuth()

const user = computed(() => (session.value.status === 'authenticated' ? session.value.session.user : null))
const initials = computed(() => {
  const name = user.value?.name ?? 'Cimi user'
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
})
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton size="lg" class="cursor-default hover:bg-transparent">
        <Avatar size="sm">
          <AvatarFallback>{{ initials }}</AvatarFallback>
        </Avatar>
        <span class="grid flex-1 text-left text-sm leading-tight">
          <span class="truncate font-medium">{{ user?.name ?? 'Cimi user' }}</span>
          <span class="text-muted-foreground truncate text-xs">{{ user?.email ?? 'Authenticated' }}</span>
        </span>
        <HugeiconsIcon :icon="UserCircle02Icon" :size="16" aria-hidden="true" />
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
