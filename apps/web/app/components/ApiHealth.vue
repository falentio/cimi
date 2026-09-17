<script setup lang="ts">
import { useQuery } from '@pinia/colada'

const orpc = useOrpc()
const { data, error, isLoading } = useQuery(orpc.health.health.queryOptions())
</script>

<template>
  <section>
    <p v-if="isLoading">Checking API health...</p>
    <p v-else-if="error">API health error: {{ error.message }}</p>
    <p v-else>API health: {{ data?.status ?? 'unknown' }}</p>
  </section>
</template>
