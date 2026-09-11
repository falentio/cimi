<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { ArrowDown01Icon, Globe02Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import {
  getTeamInitials,
  getTeamKindLabel,
  type WorkspaceSite,
  type WorkspaceTeam,
} from './workspace'

const props = defineProps<{
  teams: readonly WorkspaceTeam[]
  sites: readonly WorkspaceSite[]
  activeTeamId: string
  activeSiteId?: string
}>()

const emit = defineEmits<{
  teamChange: [teamId: string]
  siteChange: [siteId: string]
}>()

const { isMobile } = useSidebar()
const searchOpen = shallowRef(false)

const activeTeam = computed(
  () => props.teams.find((team) => team.id === props.activeTeamId) ?? props.teams[0],
)
const activeSite = computed(() => props.sites.find((site) => site.id === props.activeSiteId))

const triggerLabel = computed(() => {
  const teamName = activeTeam.value?.name ?? 'No organization selected'
  const siteName = activeSite.value?.name ?? 'No site selected'
  return `Switch organization and site. Current organization: ${teamName}. Current site: ${siteName}`
})

function selectTeam(teamId: string): void {
  searchOpen.value = false
  emit('teamChange', teamId)
}

function selectSite(siteId: string): void {
  searchOpen.value = false
  emit('siteChange', siteId)
}
</script>

<template>
  <SidebarMenu>
    <SidebarMenuItem>
      <Popover v-model:open="searchOpen">
        <PopoverTrigger as-child>
          <SidebarMenuButton
            size="lg"
            :aria-label="triggerLabel"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <span
              class="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold tracking-wide"
              aria-hidden="true"
            >
              {{ activeTeam === undefined ? '—' : getTeamInitials(activeTeam.name) }}
            </span>
            <span class="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{
                activeTeam?.name ?? 'Select an organization'
              }}</span>
              <span class="truncate text-xs text-sidebar-foreground/60">
                {{ activeSite?.hostname ?? 'Choose a site' }}
              </span>
            </span>
            <HugeiconsIcon :icon="ArrowDown01Icon" :size="16" class="ml-auto" aria-hidden="true" />
          </SidebarMenuButton>
        </PopoverTrigger>
        <PopoverContent
          class="w-80 max-w-[calc(100vw-1rem)] overflow-hidden p-0"
          align="start"
          :side="isMobile ? 'bottom' : 'right'"
          :side-offset="4"
        >
          <Command>
            <CommandInput
              aria-label="Search organizations and sites"
              placeholder="Search organizations and sites…"
            />
            <CommandList class="max-h-80">
              <CommandEmpty>No organizations or sites found.</CommandEmpty>
              <CommandGroup heading="Organizations">
                <CommandItem
                  v-for="team in teams"
                  :key="team.id"
                  :value="team.name"
                  @select="selectTeam(team.id)"
                >
                  <span
                    class="bg-sidebar-primary/10 text-sidebar-primary flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold tracking-wide"
                    aria-hidden="true"
                  >
                    {{ getTeamInitials(team.name) }}
                  </span>
                  <span class="grid min-w-0 flex-1 leading-tight">
                    <span class="truncate">{{ team.name }}</span>
                    <span class="truncate text-xs text-muted-foreground">{{
                      getTeamKindLabel(team)
                    }}</span>
                  </span>
                  <CommandShortcut v-if="activeTeamId === team.id">Current</CommandShortcut>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Sites">
                <CommandItem
                  v-for="site in sites"
                  :key="site.id"
                  :value="`${site.name} ${site.hostname} ${teams.find((team) => team.id === site.teamId)?.name ?? ''}`"
                  @select="selectSite(site.id)"
                >
                  <HugeiconsIcon :icon="Globe02Icon" :size="16" aria-hidden="true" />
                  <span class="grid min-w-0 flex-1 leading-tight">
                    <span class="truncate">{{ site.name }}</span>
                    <span class="truncate text-xs text-muted-foreground">
                      {{ site.hostname }} ·
                      {{ teams.find((team) => team.id === site.teamId)?.name }}
                    </span>
                  </span>
                  <HugeiconsIcon
                    v-if="activeSiteId === site.id"
                    :icon="Tick02Icon"
                    :size="16"
                    class="text-primary"
                    aria-label="Current site"
                  />
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  </SidebarMenu>
</template>
