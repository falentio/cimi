<script setup lang="ts">
import { computed } from 'vue'
import { formatRetentionDate } from './retention-policy.utils'
import type { SiteRetentionEditorView, SiteRetentionProvenance } from './site-retention.types'
import RetentionPolicyCard from './RetentionPolicyCard.vue'

const props = defineProps<{
  policy: SiteRetentionEditorView
  provenance: SiteRetentionProvenance
  updatedAt: string
}>()

const provenanceLabel = computed(() =>
  props.provenance === 'site-override' ? 'Site override' : 'Installation default',
)

const effectiveCaption = computed(() =>
  props.provenance === 'site-override'
    ? 'This Site uses its own override, which replaces the installation default wholesale.'
    : 'This Site has no override and uses the installation default.',
)

const changedLabel = computed(() => ({
  label: 'Retention settings last changed',
  value: formatRetentionDate(props.updatedAt),
  datetime: props.updatedAt,
}))
</script>

<template>
  <section aria-labelledby="site-retention-policies-title" class="grid min-w-0 gap-3">
    <div>
      <h2 id="site-retention-policies-title" class="text-lg font-semibold tracking-tight">
        Retention layers
      </h2>
      <p class="text-muted-foreground text-sm">
        A Site override is used verbatim when it exists. It does not have to be shorter or longer
        than the installation default.
      </p>
    </div>

    <div class="grid min-w-0 gap-3 lg:grid-cols-2">
      <RetentionPolicyCard
        heading="Installation default"
        caption="The installation-wide default that every Site inherits without an override."
        :policy="policy.installationDefault"
      />

      <RetentionPolicyCard
        v-if="policy.siteOverride"
        heading="Site override"
        caption="Stored for this Site only. Clearing it restores the installation default."
        provenance="Site override"
        :policy="policy.siteOverride"
      />
      <div v-else class="min-w-0 rounded-lg border p-4">
        <h3 class="font-medium">Site override</h3>
        <p class="text-muted-foreground mt-1 text-sm">
          This Site has no retention override. It inherits the installation default until an
          override is saved.
        </p>
      </div>

      <RetentionPolicyCard
        heading="Effective policy"
        :caption="effectiveCaption"
        :footer="changedLabel"
        :policy="policy.effective"
        :provenance="provenanceLabel"
      />
    </div>
  </section>
</template>
