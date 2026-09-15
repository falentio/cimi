# Combobox

An autocomplete input paired with a filterable suggestion list; reach for it when a user picks one or more values from a known set and typing to narrow the list is the point.

## Conclusion

The parts follow reka-ui's Combobox anatomy, but this wrapper renames the popup `UIComboboxList`, which itself renders `ComboboxContent` inside a `ComboboxPortal`, so you nest `Input`, `Empty`, `Group`, and `Item` under it. `UICombobox` is mandatory and carries the model plus the comparison field; `UIComboboxList` and `UIComboboxInput` are mandatory next. The one gotcha is object values: bind `by="<field>"` on the root so deep-object equality resolves selection, and give each `UIComboboxItem` a `textValue` or a `displayValue` when the rendered text is not the label you want announced and filtered.

## Usage

```vue
<template>
  <UICombobox v-model="selected" by="label">
    <UIComboboxAnchor as-child>
      <UIComboboxTrigger as-child>
        <UIButton variant="outline" class="w-[200px] justify-between">
          {{ selected?.label ?? "Select framework..." }}
        </UIButton>
      </UIComboboxTrigger>
    </UIComboboxAnchor>
    <UIComboboxList>
      <UIComboboxInput placeholder="Search framework..." />
      <UIComboboxEmpty>No framework found.</UIComboboxEmpty>
      <UIComboboxGroup>
        <UIComboboxItem v-for="item in frameworks" :key="item.value" :value="item">
          {{ item.label }}
          <UIComboboxItemIndicator />
        </UIComboboxItem>
      </UIComboboxGroup>
    </UIComboboxList>
  </UICombobox>
</template>
```

## Meaningful Information

- `index.ts` exports `Combobox`, `ComboboxAnchor`, `ComboboxEmpty`, `ComboboxGroup`, `ComboboxInput`, `ComboboxItem`, `ComboboxItemIndicator`, `ComboboxList`, `ComboboxSeparator`, `ComboboxTrigger`, `ComboboxViewport` as components, plus a lowercase component re-export `ComboboxCancel` from `reka-ui`.
- Import each lowercase or type-only export explicitly, since auto-import only covers the components: `import { ComboboxCancel } from "@/components/ui/combobox"`.
- Required nesting: `UICombobox` wraps everything and `UIComboboxList` holds `UIComboboxInput`, `UIComboboxEmpty`, `UIComboboxGroup`, and `UIComboboxItem`. `UIComboboxGroup` renders a `ComboboxLabel` when you pass `heading`, so supply `heading` instead of composing a separate label.
- `UICombobox` forwards `ComboboxRootProps` and `ComboboxRootEmits`, so all of these live on the root.
- `v-model` binds `modelValue` (`T | T[]`); set `multiple` to accept an array for multi-select, or bind an array without `multiple` to reset `modelValue` to `null`/`[]` on clear via `resetModelValueOnClear`.
- `by` accepts a field name (`string`) or a comparator `(a, b) => boolean` and controls how object values are matched.
- Filtering runs on rendered text by default; set `ignoreFilter` and filter the list yourself for custom matching, or use `useFilter` from reka-ui.
- `resetSearchTermOnBlur` defaults to `true` and `resetSearchTermOnSelect` defaults to `true`; set either to `false` to keep the typed query.
- `ComboboxRootProps` also accepts `defaultValue`, `defaultOpen`, `open` (with `v-model:open`), `openOnClick` (default `false`), `openOnFocus` (default `false`), `highlightOnHover` (default `true`), `disabled`, `required`, `name`, `dir` (`"ltr" | "rtl"`), and `as`/`asChild`.
- `ComboboxRootEmits` events are `update:modelValue`, `update:open`, and `highlight` (`{ ref, value }`).
- `UIComboboxInput` wraps the input in an `InputGroup` with a search icon and forwards `ComboboxInputProps`/`ComboboxInputEmits`. It adds `displayValue` as `(val: any) => string`, which sets the input text for the selected item and does not work with `multiple`; it also takes `modelValue` (the search term, bindable with `v-model`) and `autoFocus`.
- `UIComboboxItem` requires a `value` prop (`T`) and takes `disabled` and `textValue` (`string`, the plain-text representation used for autocomplete when children are not plain text). It emits `select` (`SelectEvent<T>`), which you cancel with `@select.prevent` to keep the popup open.
- `UIComboboxList` defaults to `position="popper"`, `align="center"`, and `sideOffset: 4`, and forwards `ComboboxContentProps`/`ComboboxContentEmits` such as `align` (`"start" | "center" | "end"`), `side`, and `hideWhenEmpty`.
- `UIComboboxViewport` is optional and provides a scrolling, max-height container for large lists; nest it inside `UIComboboxList` around the groups.
- `UIComboboxItemIndicator` renders only while its item is selected; wrap an icon inside it.
- `UIComboboxTrigger` toggles the popup and renders a `button` by default; pair it with `UIComboboxAnchor as-child` so the trigger anchors the popper. `UIComboboxCancel` clears the search term.
- `ComboboxRoot` default slot exposes `open` (`boolean`) and `modelValue` (`T | T[]`); `UICombobox` forwards that slot scope.
- Keyboard and ARIA behavior follow the Combobox WAI-ARIA design pattern, per reka-ui.
- Styling hooks are `data-slot="combobox"`, `combobox-anchor`, `combobox-input`, `combobox-trigger`, `combobox-content`, `combobox-viewport`, `combobox-group`, `combobox-item`, `combobox-item-indicator`, and `combobox-separator`; selected items expose `data-selected` and the empty state keys off `group-data-empty/combobox-content`.

## Examples

```vue
<!-- Single select with an object value and a trigger -->
<template>
  <UICombobox v-model="selected" by="label">
    <UIComboboxAnchor as-child>
      <UIComboboxTrigger as-child>
        <UIButton variant="outline" class="w-[200px] justify-between">
          {{ selected?.label ?? "Select framework..." }}
          <HugeiconsIcon :icon="ChevronsUpDownIcon" class="opacity-50" />
        </UIButton>
      </UIComboboxTrigger>
    </UIComboboxAnchor>
    <UIComboboxList>
      <UIComboboxInput placeholder="Search framework..." />
      <UIComboboxEmpty>No framework found.</UIComboboxEmpty>
      <UIComboboxGroup>
        <UIComboboxItem v-for="item in frameworks" :key="item.value" :value="item">
          {{ item.label }}
          <UIComboboxItemIndicator><HugeiconsIcon :icon="CheckIcon" /></UIComboboxItemIndicator>
        </UIComboboxItem>
      </UIComboboxGroup>
    </UIComboboxList>
  </UICombobox>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { CheckIcon, ChevronsUpDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'

const frameworks = [
  { value: 'next.js', label: 'Next.js' },
  { value: 'nuxt.js', label: 'Nuxt.js' },
]
const selected = ref<(typeof frameworks)[number]>()
</script>
```

```vue
<!-- Multiple select bound to an array -->
<template>
  <UICombobox v-model="selectedFrameworks" multiple by="label">
    <UIComboboxAnchor as-child>
      <UIComboboxTrigger as-child>
        <UIButton variant="outline" class="w-[280px] justify-between">
          <span class="truncate">
            {{ selectedFrameworks.length ? selectedFrameworks.map(f => f.label).join(", ") : "Select frameworks..." }}
          </span>
        </UIButton>
      </UIComboboxTrigger>
    </UIComboboxAnchor>
    <UIComboboxList class="w-[280px]" align="start">
      <UIComboboxInput placeholder="Search framework..." />
      <UIComboboxEmpty>No framework found.</UIComboboxEmpty>
      <UIComboboxGroup>
        <UIComboboxItem v-for="item in frameworks" :key="item.value" :value="item">
          {{ item.label }}
        </UIComboboxItem>
      </UIComboboxGroup>
    </UIComboboxList>
  </UICombobox>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const frameworks = [
  { value: 'next.js', label: 'Next.js' },
  { value: 'nuxt.js', label: 'Nuxt.js' },
]
const selectedFrameworks = ref<typeof frameworks>([])
</script>
```

```vue
<!-- Grouped, scrollable list with a separator and an action item -->
<template>
  <UICombobox v-model="selectedTimezone" by="label">
    <UIComboboxAnchor as-child>
      <UIComboboxTrigger as-child>
        <UIButton variant="outline" class="h-12 w-[200px] justify-between px-2.5">
          {{ selectedTimezone?.label ?? "Select timezone" }}
        </UIButton>
      </UIComboboxTrigger>
    </UIComboboxAnchor>
    <UIComboboxList class="w-72" align="start">
      <UIComboboxInput placeholder="Search timezone..." />
      <UIComboboxViewport class="max-h-[260px]">
        <UIComboboxEmpty>No timezone found.</UIComboboxEmpty>
        <UIComboboxGroup v-for="region in regions" :key="region.label" :heading="region.label">
          <UIComboboxItem v-for="tz in region.timezones" :key="tz.value" :value="tz">
            {{ tz.label }}
            <UIComboboxItemIndicator />
          </UIComboboxItem>
        </UIComboboxGroup>
      </UIComboboxViewport>
      <UIComboboxSeparator />
      <UIComboboxGroup>
        <UIComboboxItem :value="null">Create timezone</UIComboboxItem>
      </UIComboboxGroup>
    </UIComboboxList>
  </UICombobox>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const regions = [
  { label: 'Americas', timezones: [{ value: 'America/New_York', label: '(GMT-5) New York' }] },
  { label: 'Europe', timezones: [{ value: 'Europe/London', label: '(GMT+0) London' }] },
]
const selectedTimezone = ref<(typeof regions)[number]['timezones'][number]>()
</script>
```

```vue
<!-- Custom filtering through ignoreFilter plus a bound search term -->
<template>
  <UICombobox v-model="selected" :ignore-filter="true">
    <UIComboboxAnchor as-child>
      <UIComboboxTrigger as-child>
        <UIButton variant="outline">{{ selected?.label ?? "Select..." }}</UIButton>
      </UIComboboxTrigger>
    </UIComboboxAnchor>
    <UIComboboxList>
      <UIComboboxInput v-model="searchTerm" placeholder="Search..." />
      <UIComboboxGroup>
        <UIComboboxItem v-for="item in filtered" :key="item.value" :value="item">
          {{ item.label }}
        </UIComboboxItem>
      </UIComboboxGroup>
    </UIComboboxList>
  </UICombobox>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFilter } from 'reka-ui'

const people = [
  { value: '1', label: 'Durward Reynolds' },
  { value: '2', label: 'Kenton Towne' },
]
const { startsWith } = useFilter({ sensitivity: 'base' })
const searchTerm = ref('')
const filtered = computed(() => people.filter(p => startsWith(p.label, searchTerm.value)))
const selected = ref<(typeof people)[number]>()
</script>
```

## References

- [Combobox](../combobox/AGENTS.md)
- [Input Group](../input-group/AGENTS.md)
- [Button](../button/AGENTS.md)
- [shadcn-vue Combobox](https://shadcn-vue.com/docs/components/combobox)
- [reka-ui Combobox](https://reka-ui.com/docs/components/combobox)
