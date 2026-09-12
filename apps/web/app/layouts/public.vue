<script setup lang="ts">
useSeoMeta({
  robots: 'noindex, nofollow',
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="border-b">
      <div class="mx-auto flex h-12 w-full max-w-5xl items-center px-4">
        <span class="text-sm font-medium">Public Dashboard</span>
      </div>
    </header>
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
  </div>
</template>
