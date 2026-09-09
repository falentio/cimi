<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { HugeiconsIcon } from '@hugeicons/vue'
import { DashboardSquare01Icon } from '@hugeicons/core-free-icons'
</script>

<template>
  <div class="flex flex-col gap-8">
    <section class="flex flex-col gap-2">
      <p class="text-primary text-sm font-medium">Cimi workspace</p>
      <h1 class="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
        A clear place to start.
      </h1>
      <p class="text-muted-foreground max-w-2xl text-base/relaxed">
        Your Cimi workspace is ready. The first resource views will land here as they become
        available.
      </p>
    </section>

    <Empty class="min-h-64 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon :icon="DashboardSquare01Icon" aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Your workspace is ready.</EmptyTitle>
        <EmptyDescription>
          This is the starting point for your Cimi workspace. There is nothing else to configure
          yet.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>

    <section class="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Workspace starting point</CardTitle>
          <CardDescription
            >Resource views can be added here as they become available.</CardDescription
          >
        </CardHeader>
        <CardContent>
          <p class="text-muted-foreground text-sm/relaxed">
            This page provides a simple place to begin.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Clear structure</CardTitle>
          <CardDescription
            >Keep workspace destinations close as they become available.</CardDescription
          >
        </CardHeader>
        <CardContent>
          <p class="text-muted-foreground text-sm/relaxed">
            New views can join this page without changing its starting point.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ready to grow</CardTitle>
          <CardDescription>New views can join this page as the workspace grows.</CardDescription>
        </CardHeader>
        <CardContent>
          <p class="text-muted-foreground text-sm/relaxed">
            The landing state keeps the next step intentionally small.
          </p>
        </CardContent>
      </Card>
    </section>
  </div>
</template>
