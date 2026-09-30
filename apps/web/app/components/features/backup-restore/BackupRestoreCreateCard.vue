<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import type { CreateSectionView } from './backup-restore.types'

defineProps<{ section: CreateSectionView }>()

const emit = defineEmits<{
  create: []
  refresh: []
}>()
</script>

<template>
  <section aria-labelledby="backup-create-title">
    <Card v-if="section.kind === 'available'">
      <CardHeader>
        <CardTitle><h2 id="backup-create-title">Create a source backup</h2></CardTitle>
        <CardDescription>
          Capture a consistent SQLite-authoritative backup for future recovery.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap gap-2">
        <Button type="button" @click="emit('create')">Create backup</Button>
      </CardContent>
    </Card>

    <Card v-else-if="section.kind === 'blocked'">
      <CardHeader>
        <CardTitle><h2 id="backup-create-title">Create a source backup</h2></CardTitle>
        <CardDescription>{{ section.reason }}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" @click="emit('refresh')">Refresh status</Button>
      </CardContent>
    </Card>

    <div v-else-if="section.kind === 'submitting'" class="rounded-lg border p-4">
      <div class="flex items-center gap-2 text-sm">
        <Spinner aria-hidden="true" />
        Starting a source backup
      </div>
    </div>

    <Card v-else-if="section.kind === 'tracking'">
      <CardHeader>
        <CardTitle>Source backup accepted</CardTitle>
      </CardHeader>
      <CardContent class="text-sm">
        The server is processing the backup. Operation ID <code>{{ section.operationId }}</code> is
        shown for support correlation only.
      </CardContent>
    </Card>

    <Alert v-else variant="destructive">
      <AlertTitle>Backup could not be started</AlertTitle>
      <AlertDescription>{{ section.error.message }}</AlertDescription>
      <div class="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" @click="emit('create')">Try again</Button>
        <Button type="button" size="sm" variant="outline" @click="emit('refresh')">
          Refresh status
        </Button>
      </div>
    </Alert>
  </section>
</template>
