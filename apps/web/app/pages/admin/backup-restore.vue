<script setup lang="ts">
import BackupRestoreContainer from '@/components/features/backup-restore/BackupRestoreContainer.vue'

definePageMeta({
  admin: true,
})

useHead({ title: 'Backup and restore' })
</script>

<template>
  <BackupRestoreContainer />
</template>
