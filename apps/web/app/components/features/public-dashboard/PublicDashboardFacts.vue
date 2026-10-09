<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PUBLIC_DASHBOARD_LIFECYCLE_FACTS,
  PUBLIC_DASHBOARD_SCOPE_FACTS,
} from './public-dashboard.utils'
</script>

<template>
  <div class="grid gap-4 lg:grid-cols-2">
    <Card>
      <CardHeader>
        <CardTitle>
          <h3 class="text-base font-semibold">What the public view exposes</h3>
        </CardTitle>
        <CardDescription>
          These bounds come from the public query contract, not from this page.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl class="flex flex-col gap-3 text-sm">
          <div v-for="fact in PUBLIC_DASHBOARD_SCOPE_FACTS" :key="fact.label">
            <dt class="font-medium">{{ fact.label }}</dt>
            <dd class="text-muted-foreground">{{ fact.detail }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>
          <h3 class="text-base font-semibold">Site lifecycle</h3>
        </CardTitle>
        <CardDescription>
          Deletion suspends public access. Recovery restores the prior configuration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl class="flex flex-col gap-3 text-sm">
          <div v-for="fact in PUBLIC_DASHBOARD_LIFECYCLE_FACTS" :key="fact.label">
            <dt class="font-medium">{{ fact.label }}</dt>
            <dd class="text-muted-foreground">{{ fact.detail }}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  </div>
</template>
