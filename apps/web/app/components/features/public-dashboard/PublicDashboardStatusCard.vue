<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import PublicDashboardLinkPanel from './PublicDashboardLinkPanel.vue'
import type {
  PublicDashboardConfig,
  PublicDashboardOperation,
  PublicDashboardStatus,
} from './public-dashboard.types'
import { formatPublicDashboardDate, publicDashboardStatusLabel } from './public-dashboard.utils'

const props = defineProps<{
  status: PublicDashboardStatus
  config: PublicDashboardConfig | null
  operations: readonly PublicDashboardOperation[]
  busy: boolean
}>()

const emit = defineEmits<{ request: [operation: PublicDashboardOperation] }>()

const identifier = computed(() => props.config?.publicDashboardIdentifier ?? null)

const updatedAt = computed(() =>
  props.config === null ? null : formatPublicDashboardDate(props.config.updatedAt),
)

const badgeVariant = computed(() => (props.status === 'enabled' ? 'default' : 'secondary'))

const ACTION_LABELS: Readonly<Record<PublicDashboardOperation, string>> = {
  enable: 'Enable public dashboard',
  rotate: 'Rotate identifier',
  disable: 'Disable public dashboard',
}

function actionVariant(operation: PublicDashboardOperation) {
  return operation === 'disable' ? 'destructive' : operation === 'enable' ? 'default' : 'outline'
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h3 class="text-base font-semibold">Public access</h3>
      </CardTitle>
      <CardDescription>
        The public dashboard serves approved aggregate analytics to anyone holding its link.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-5">
      <dl class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <dt class="text-muted-foreground">Status</dt>
          <dd>
            <Badge :variant="badgeVariant">{{ publicDashboardStatusLabel(status) }}</Badge>
          </dd>
        </div>
        <div v-if="updatedAt" class="flex items-center gap-2">
          <dt class="text-muted-foreground">Configuration changed</dt>
          <dd class="tabular-nums">{{ updatedAt }}</dd>
        </div>
      </dl>

      <p v-if="status === 'unconfigured'" class="text-muted-foreground text-sm">
        This Site has never enabled the public dashboard, so no public link exists. Enabling issues
        the first identifier.
      </p>

      <p v-else-if="status === 'disabled'" class="text-muted-foreground text-sm">
        The identifier is revoked. The server authorizes no new public request. Enabling issues a
        new identifier.
      </p>

      <PublicDashboardLinkPanel v-else-if="identifier !== null" :identifier="identifier" />

      <div class="flex flex-wrap gap-2">
        <Button
          v-for="operation in operations"
          :key="operation"
          type="button"
          :variant="actionVariant(operation)"
          :disabled="busy"
          @click="emit('request', operation)"
        >
          <Spinner v-if="busy" aria-hidden="true" />
          {{ ACTION_LABELS[operation] }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
