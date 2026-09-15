# Command

A filterable command palette for running actions or jumping to destinations; reach for it when a user types to narrow a list of commands, links, or options.

## Conclusion

Everything renders through the `UICommand` root, which is a reka-ui `ListboxRoot` that provides a context carrying `allItems`, `allGroups`, and `filterState`. `UICommandInput` and `UICommandList` are mandatory; `UICommandItem` must sit inside a `UICommandGroup`, because grouping is what the empty state and per-group hiding key off. Filtering is built in and runs on each item's rendered text, so you rarely filter yourself. The one gotcha is `UICommandDialog`, which wraps the whole palette in a `Dialog` and hides an `sr-only` title and description that you override with the `title` and `description` props.

## Usage

```vue
<template>
  <UICommand>
    <UICommandInput placeholder="Type a command or search..." />
    <UICommandList>
      <UICommandEmpty>No results found.</UICommandEmpty>
      <UICommandGroup heading="Suggestions">
        <UICommandItem>Calendar</UICommandItem>
        <UICommandItem>Search Emoji</UICommandItem>
        <UICommandItem>Calculator</UICommandItem>
      </UICommandGroup>
      <UICommandSeparator />
      <UICommandGroup heading="Settings">
        <UICommandItem>Profile</UICommandItem>
        <UICommandItem>Billing</UICommandItem>
        <UICommandItem>Settings</UICommandItem>
      </UICommandGroup>
    </UICommandList>
  </UICommand>
</template>
```

## Meaningful Information

- `index.ts` exports `Command`, `CommandDialog`, `CommandEmpty`, `CommandGroup`, `CommandInput`, `CommandItem`, `CommandList`, `CommandSeparator`, `CommandShortcut` as components, plus the two lowercase factories `useCommand` and `useCommandGroup`.
- Required nesting: `UICommand` wraps everything, `UICommandList` holds `UICommandEmpty`, `UICommandGroup`, `UICommandItem`, and `UICommandSeparator`, and `UICommandItem` lives inside a `UICommandGroup`. `UICommandGroup` registers its own id in `allGroups` on mount, so an ungrouped item never joins a group and group-level hiding cannot apply to it.
- `useCommand()` returns `{ allItems, allGroups, filterState }`, where `allItems` is `Ref<Map<string, string>>` (item id to filter text), `allGroups` is `Ref<Map<string, Set<string>>>` (group id to item ids), and `filterState` is `{ search: string, filtered: { count, items: Map<string, number>, groups: Set<string> } }`. Only call it inside a `UICommand` descendant.
- `useCommandGroup()` returns `{ id?: string }` and is provided by `UICommandGroup`; `UICommandItem` reads it to attach itself to the enclosing group.
- `UICommand` forwards `ListboxRootProps` and `ListboxRootEmits`, so `modelValue` (default `''`), `highlightOnHover` (default `true`), `multiple`, `disabled`, `dir` (`"ltr" | "rtl"`), and `as`/`asChild` live on the root. Its emits are `update:modelValue` and `highlight` (`{ ref, value }`).
- Filtering is automatic: `UICommand` owns a `filterState.search` ref bound to the input, and each item, group, and the empty state react to it. Matching uses reka-ui `useFilter({ sensitivity: 'base' })` with `contains` against the item's text content, so an empty search shows everything.
- `UICommandItem` derives its filter text from the rendered text content and falls back to `String(value)`. Set `value` to make selection and the fallback filter text deterministic, and pass `disabled` to block it.
- `UICommandItem` clears `filterState.search` on `select`, so the query resets after a command runs. It forwards `ListboxItemProps` and `ListboxItemEmits`, and a checked item shows a `Tick02Icon` that hides when a `UICommandShortcut` is present.
- `UICommandEmpty` renders only while `filterState.search` is non-empty and `filtered.count` is `0`; it shows nothing on a pristine palette.
- `UICommandGroup` takes `heading` (`string`) and renders it as a `ListboxGroupLabel`; without `heading` the group has no visible label. It hides itself when no descendant item matches the search.
- `UICommandInput` renders a `ListboxFilter` inside an `InputGroup` with a search icon, binds `v-model` to `filterState.search`, and sets `auto-focus`. It forwards `ListboxFilterProps`, takes `placeholder`, and uses `inheritAttrs: false`.
- `UICommandShortcut` is a presentational `span` for the key hint on the right of an item; it takes only `class` and no keyboard wiring.
- `UICommandSeparator` renders a reka-ui `Separator` and takes only separator props plus `class`.
- `UICommandDialog` forwards `DialogRootProps` and `DialogRootEmits`, takes `title` (default `"Command Palette"`), `description` (default `"Search for a command to run..."`), `showCloseButton` (default `false`), and `class`, and exposes the `Dialog` slot scope to its default slot. Bind its visibility with `v-model:open`, and place `UICommandInput`, `UICommandList`, and the rest of the palette inside it.
- Keyboard and ARIA behavior follow the reka-ui Listbox pattern (the shadcn-vue page points at reka-ui Listbox for its API): `Enter` selects the highlighted item, `ArrowDown`/`ArrowUp` move the highlight, and `Home`/`End` jump to the ends.
- Styling hooks are the `data-slot` values `command`, `command-input-wrapper`, `command-input`, `command-list`, `command-empty`, `command-group`, `command-group-heading`, `command-item`, `command-separator`, and `command-shortcut`; the highlighted item and driven states key off `data-highlighted` and `data-[checked=true]`.

## Examples

```vue
<!-- Plain command palette with groups, a separator, and shortcuts -->
<template>
  <UICommand class="rounded-lg border shadow-md md:min-w-[450px]">
    <UICommandInput placeholder="Type a command or search..." />
    <UICommandList>
      <UICommandEmpty>No results found.</UICommandEmpty>
      <UICommandGroup heading="Suggestions">
        <UICommandItem value="calendar">
          <HugeiconsIcon :icon="CalendarIcon" />
          <span>Calendar</span>
        </UICommandItem>
        <UICommandItem value="emoji">
          <HugeiconsIcon :icon="SmileIcon" />
          <span>Search Emoji</span>
        </UICommandItem>
        <UICommandItem disabled value="calculator">
          <HugeiconsIcon :icon="CalculatorIcon" />
          <span>Calculator</span>
        </UICommandItem>
      </UICommandGroup>
      <UICommandSeparator />
      <UICommandGroup heading="Settings">
        <UICommandItem value="profile">
          <HugeiconsIcon :icon="UserIcon" />
          <span>Profile</span>
          <UICommandShortcut>⌘P</UICommandShortcut>
        </UICommandItem>
        <UICommandItem value="billing">
          <HugeiconsIcon :icon="CreditCardIcon" />
          <span>Billing</span>
          <UICommandShortcut>⌘B</UICommandShortcut>
        </UICommandItem>
        <UICommandItem value="settings">
          <HugeiconsIcon :icon="SettingsIcon" />
          <span>Settings</span>
          <UICommandShortcut>⌘S</UICommandShortcut>
        </UICommandItem>
      </UICommandGroup>
    </UICommandList>
  </UICommand>
</template>

<script setup lang="ts">
import { CalculatorIcon, CalendarIcon, CreditCardIcon, SettingsIcon, SmileIcon, UserIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/vue'
</script>
```

```vue
<!-- CommandDialog opened with the meta+j keyboard shortcut -->
<template>
  <UICommandDialog v-model:open="open">
    <UICommandInput placeholder="Type a command or search..." />
    <UICommandList>
      <UICommandEmpty>No results found.</UICommandEmpty>
      <UICommandGroup heading="Suggestions">
        <UICommandItem value="calendar">
          <span>Calendar</span>
        </UICommandItem>
        <UICommandItem value="settings">
          <span>Settings</span>
        </UICommandItem>
      </UICommandGroup>
    </UICommandList>
  </UICommandDialog>
</template>

<script setup lang="ts">
import { useMagicKeys, whenever } from '@vueuse/core'
import { ref } from 'vue'

const open = ref(false)
const { meta_j } = useMagicKeys()
whenever(meta_j!, () => {
  open.value = true
})
</script>
```

## References

- [shadcn-vue Command](https://shadcn-vue.com/docs/components/command)
- [reka-ui Listbox](https://reka-ui.com/docs/components/listbox)
- [Dialog](../dialog/AGENTS.md)
- [Input Group](../input-group/AGENTS.md)
