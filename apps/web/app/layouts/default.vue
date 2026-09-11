<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from '@/components/features/app-shell/AppSidebar.vue'
import { resolveBreadcrumbs } from '@/components/features/app-shell/breadcrumbs'

const route = useRoute()
const breadcrumbs = computed(() => resolveBreadcrumbs(route.path))
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <header class="flex h-16 shrink-0 items-center gap-2">
        <div class="flex items-center gap-2 px-4">
          <SidebarTrigger class="-ml-1" />
          <Separator orientation="vertical" class="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <template v-for="(segment, index) in breadcrumbs" :key="segment.label">
                <template v-if="index > 0">
                  <BreadcrumbSeparator />
                </template>
                <BreadcrumbItem>
                  <BreadcrumbLink v-if="segment.to && index < breadcrumbs.length - 1" as-child>
                    <NuxtLink :to="segment.to" class="text-muted-foreground hover:text-foreground">
                      {{ segment.label }}
                    </NuxtLink>
                  </BreadcrumbLink>
                  <BreadcrumbPage v-else>{{ segment.label }}</BreadcrumbPage>
                </BreadcrumbItem>
              </template>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div class="flex flex-1 flex-col gap-4 p-4 pt-0">
        <slot />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
