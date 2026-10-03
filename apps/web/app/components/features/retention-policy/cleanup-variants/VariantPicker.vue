<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'

const props = defineProps<{ variants: ReadonlyArray<{ id: string; label: string }> }>()

const route = useRoute()

const router = useRouter()

const active = computed(() => {
  const raw = route.query.variant
  const id = Array.isArray(raw) ? String(raw[0]) : raw === undefined ? undefined : String(raw)

  // SAFETY: some() above proves the query id matches a known variant id.
  return props.variants.some((v) => v.id === id) ? (id as string) : props.variants[0]!.id
})

function select(id: string): void {
  void router.replace({ query: { ...route.query, variant: id } })
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog]',
    ) !== null
  )
}

function onKeydown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) return
  const ids = props.variants.map((v) => v.id)
  const index = ids.indexOf(active.value)

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const step = event.key === 'ArrowLeft' ? -1 : 1
    select(ids[(index + step + ids.length) % ids.length]!)

    return
  }

  if (/^[1-9]$/.test(event.key)) {
    const target = ids[Number(event.key) - 1]

    if (target !== undefined) select(target)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <nav class="variant-picker" aria-label="Variants">
    <button
      v-for="v in variants"
      :key="v.id"
      type="button"
      :data-variant="v.id"
      :aria-current="v.id === active ? 'true' : undefined"
      @click="select(v.id)"
    >
      {{ v.label }}
    </button>
  </nav>
</template>

<style scoped>
.variant-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  translate: -50% 0;
  z-index: 2147483647;
  display: flex;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgb(20 20 20 / 0.9);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / 0.1),
    0 8px 24px rgb(0 0 0 / 0.25);
  font:
    13px/1 -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  user-select: none;
  max-width: min(92vw, 720px);
  overflow-x: auto;
}

.variant-picker button {
  padding: 7px 14px;
  border: 0;
  border-radius: 999px;
  background: none;
  color: rgb(255 255 255 / 0.6);
  cursor: pointer;
}

.variant-picker button:hover {
  color: rgb(255 255 255 / 0.85);
}

.variant-picker button[aria-current='true'] {
  background: rgb(255 255 255 / 0.14);
  color: rgb(255 255 255);
}

.variant-picker button:focus-visible {
  outline: 2px solid rgb(255 255 255 / 0.7);
  outline-offset: 2px;
}
</style>
