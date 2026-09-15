# Pagination

Provides accessible page navigation for lists and tables.

## Conclusion

Use `UIPagination` with `UIPaginationContent` for stateful pagination, render page entries from the `items` slot, and keep navigation triggers as direct children of the content list.

## Usage

```vue
<template>
  <UIPagination
    v-slot="{ page }"
    :items-per-page="10"
    :total="95"
    :default-page="2"
    :show-edges="true"
    aria-label="Reports pages"
  >
    <UIPaginationContent v-slot="{ items }">
      <UIPaginationPrevious />
      <template v-for="(item, index) in items" :key="`${item.type}-${index}`">
        <UIPaginationItem
          v-if="item.type === 'page'"
          :value="item.value"
          :is-active="item.value === page"
        >
          {{ item.value }}
        </UIPaginationItem>
        <UIPaginationEllipsis v-else />
      </template>
      <UIPaginationNext />
    </UIPaginationContent>
  </UIPagination>
</template>
```

## Meaningful Information

### Exports and auto-imports

- The `index.ts` barrel exports `Pagination`, `PaginationContent`, `PaginationEllipsis`, `PaginationFirst`, `PaginationItem`, `PaginationLast`, `PaginationLink`, `PaginationNext`, and `PaginationPrevious` in this order.
- `shadcn-nuxt` auto-imports these PascalCase exports with the `UI` prefix. Use `UIPagination`, `UIPaginationContent`, `UIPaginationEllipsis`, `UIPaginationFirst`, `UIPaginationItem`, `UIPaginationLast`, `UIPaginationLink`, `UIPaginationNext`, and `UIPaginationPrevious` in templates without component imports.
- The barrel exports no lowercase helpers or type-only exports. Import helpers and types explicitly from their own modules when a future change adds them.

### Nesting and order

- Put one `UIPaginationContent` inside each `UIPagination`.
- Put the pagination parts directly inside `UIPaginationContent`.
- Use `UIPaginationFirst`, `UIPaginationPrevious`, the generated page and ellipsis entries, `UIPaginationNext`, and `UIPaginationLast` in that order for a complete interactive control.
- Render a page entry as `UIPaginationItem` with its required numeric `value`.
- Render an ellipsis entry as `UIPaginationEllipsis` when the content slot item has `type === 'ellipsis'`.
- `UIPaginationFirst` and `UIPaginationLast` are optional. `UIPaginationPrevious` and `UIPaginationNext` are optional when the surrounding product provides another way to move between pages.
- `UIPaginationItem` is a page trigger. It is not a wrapper for `UIPaginationPrevious`, `UIPaginationNext`, `UIPaginationFirst`, `UIPaginationLast`, or `UIPaginationEllipsis`.
- The official shadcn-vue usage page wraps several parts in `PaginationItem`, but that shape does not match this local Reka UI implementation. Wrapping one trigger inside another creates invalid nested interactive elements.

### Root props and state

`UIPagination` wraps Reka UI `PaginationRoot` and renders a `nav` element by default.

- `items-per-page` is required and determines the page count with `total`.
- `total` is the total item count. It defaults to `0`.
- `default-page` sets the initial page for uncontrolled usage. It defaults to `1`.
- `page` controls the current page. Bind it with `v-model:page` for controlled usage.
- `sibling-count` sets how many neighboring pages appear around the current page. It defaults to `2`.
- `show-edges` keeps the first page, last page, and ellipsis entries in the generated range. It defaults to `false`.
- `disabled` prevents page triggers from changing the current page.
- `as` changes the root element. It defaults to `nav`.
- `asChild` is written as `as-child` in templates. It replaces the root element with its single child while preserving the root behavior.
- `class` adds classes to the root. The local wrapper merges it after its default classes.
- The root emits `update:page` with the new numeric page. It has no default `v-model`. Use the named `page` model.
- The root exposes `page` and `pageCount` in its default slot. `pageCount` is at least `1`, including when `total` is `0`.

### Content props and slot

`UIPaginationContent` wraps Reka UI `PaginationList` and renders a `div` by default.

- `as` changes the content element. It defaults to `div`.
- `asChild` is written as `as-child` in templates. It requires one child element.
- `class` adds classes to the content list.
- The default slot exposes `items` as an array of `{ type: 'page', value: number }` or `{ type: 'ellipsis' }`.
- `UIPaginationContent` has no `v-model` and emits no pagination events. It reads the state from its parent `UIPagination`.

### Page items

`UIPaginationItem` wraps Reka UI `PaginationListItem` and renders a page trigger as a `button` by default.

- `value` is required and identifies the page number.
- `isActive` is written as `is-active` in templates. It defaults to `false` and chooses the local `outline` style when true. It does not control the root page.
- `size` defaults to `icon`.
- `size` accepts `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, and `icon-lg`.
- `as` changes the rendered trigger element. It defaults to `button`.
- `asChild` is written as `as-child` in templates. It composes the trigger behavior onto one child element.
- `class` adds classes after the local button variant classes.
- The default slot holds the page label. Render `{{ item.value }}` in generated lists so the page number is explicit.
- The underlying trigger computes the selected page from the parent root, adds `aria-label="Page N"`, and sets `aria-current="page"` for the selected page.
- `UIPaginationItem` has no `v-model` and emits no component-specific events. Clicking it changes the parent page and causes `UIPagination` to emit `update:page`.

### Static links

`UIPaginationLink` is a styled plain `a` element for URL-based pagination.

- `href` is the optional destination URL.
- `isActive` is written as `is-active` in templates. It defaults to `false`, adds the active data attribute, and sets `aria-current="page"` when true.
- `size` defaults to `icon`.
- `size` accepts `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, and `icon-lg`.
- `class` adds classes after the local link styles.
- `UIPaginationLink` has no `as` prop and no `asChild` support. Put `href` on the link itself.
- The default slot holds the link content. The component does not add an accessible label, so use meaningful visible text or pass an `aria-label`.
- `UIPaginationLink` does not read or change the parent page. It follows normal anchor behavior and has no `v-model` or pagination event.

### Navigation triggers

`UIPaginationPrevious`, `UIPaginationNext`, `UIPaginationFirst`, and `UIPaginationLast` wrap Reka UI page triggers.

- Each trigger accepts `size`, `class`, `as`, and `asChild`.
- `asChild` is written as `as-child` in templates. It requires one child element and composes the trigger behavior onto that element.
- `size` defaults to `default` for these four triggers.
- `size` accepts `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, and `icon-lg`.
- `UIPaginationPrevious` moves to the previous page and disables itself on page `1` or when the root is disabled.
- `UIPaginationNext` moves to the next page and disables itself on the last page or when the root is disabled.
- `UIPaginationFirst` moves to page `1` and disables itself on page `1` or when the root is disabled.
- `UIPaginationLast` moves to the final page and disables itself on the last page or when the root is disabled.
- The underlying triggers provide the accessible names `Previous Page`, `Next Page`, `First Page`, and `Last Page`.
- Each trigger has a default slot with a directional icon and a text label. A supplied slot replaces the icon and label together.
- These triggers have no separate `v-model` or emitted page event. Their clicks update the parent root and cause `UIPagination` to emit `update:page`.

### Ellipsis

`UIPaginationEllipsis` renders the non-interactive placeholder for omitted pages.

- `as` changes the rendered element. It defaults to `div`.
- `asChild` is written as `as-child` in templates. It requires one child element.
- `class` adds classes after the local ellipsis styles.
- The default slot contains the ellipsis icon and the screen-reader-only label `More pages`.
- A supplied slot replaces that icon and label. Keep an accessible `More pages` label in a custom slot.
- The local component has no `index` prop. Use the `v-for` index for a Vue key when rendering the `items` slot.
- `UIPaginationEllipsis` has no `v-model` and emits no events.

### Accessibility and keyboard behavior

- The root renders a `nav` landmark by default. Add an `aria-label` such as `aria-label="Reports pages"` when the landmark needs a specific name or when the page has more than one navigation landmark.
- `UIPaginationContent` uses Reka UI's accessible pagination list primitive.
- Page triggers receive `Page N` labels and mark the current root page with `aria-current="page"`.
- Previous, next, first, and last triggers receive accessible labels from the Reka UI primitives even when their visible text hides below the small-screen breakpoint.
- The default ellipsis slot includes the `More pages` screen-reader label. Preserve that meaning when replacing the slot.
- `Tab` moves focus to the next focusable element.
- `Enter` and `Space` activate a focused page or navigation trigger.
- The Reka UI pagination docs do not define arrow-key navigation. Do not depend on arrow keys to move between pages.
- The `Space` and `Enter` behavior applies to the Reka UI trigger parts. `UIPaginationLink` is a normal anchor and follows native anchor keyboard behavior.

### Gotchas

- `items-per-page` is required even when you render only static `UIPaginationLink` elements inside the content list because the content primitive still reads the root context.
- Set `is-active` from the same page state that drives the root. `UIPaginationItem` uses `isActive` only for styling, while the underlying primitive uses the root `page` for `aria-current` and selection state.
- The shadcn-vue page shows `PaginationEllipsis :index="4"` in one example. That prop is not declared by the local wrapper or the installed Reka UI `PaginationEllipsis` type. Omit it.
- Do not use `href` on `UIPaginationPrevious`, `UIPaginationNext`, `UIPaginationFirst`, or `UIPaginationLast`. They are stateful triggers, not static links. Use `UIPaginationLink` for URL-only pagination.
- `as-child` must receive exactly one child element. When you compose a trigger onto an `a` element, the anchor can still navigate even when the pagination trigger is disabled. Prevent navigation yourself when that combination is not intended.
- A custom slot on a navigation trigger replaces its fallback icon and visible label. The primitive's accessible name remains, but icon-only custom content can make the visual control unclear.
- The official shadcn-vue page currently documents only installation and a static usage example. Its static nesting and prop examples do not describe this local Reka UI-backed implementation.

## Examples

### Controlled page state

```vue
<script setup lang="ts">
import { ref } from 'vue'

const currentPage = ref(1)
</script>

<template>
  <UIPagination
    v-model:page="currentPage"
    :items-per-page="10"
    :total="100"
    :sibling-count="1"
    aria-label="Reports pages"
  >
    <UIPaginationContent v-slot="{ items }">
      <UIPaginationFirst />
      <UIPaginationPrevious />
      <template v-for="(item, index) in items" :key="`${item.type}-${index}`">
        <UIPaginationItem
          v-if="item.type === 'page'"
          :value="item.value"
          :is-active="item.value === currentPage"
        >
          {{ item.value }}
        </UIPaginationItem>
        <UIPaginationEllipsis v-else />
      </template>
      <UIPaginationNext />
      <UIPaginationLast />
    </UIPaginationContent>
  </UIPagination>
</template>
```

### URL-based links

```vue
<template>
  <UIPagination :items-per-page="10" :total="30" aria-label="Reports pages">
    <UIPaginationContent>
      <UIPaginationLink
        href="/reports?page=1"
        aria-label="Go to page 1"
        :is-active="true"
      >
        1
      </UIPaginationLink>
      <UIPaginationLink href="/reports?page=2" aria-label="Go to page 2">2</UIPaginationLink>
      <UIPaginationLink href="/reports?page=3" aria-label="Go to page 3">3</UIPaginationLink>
    </UIPaginationContent>
  </UIPagination>
</template>
```

### Composing a page trigger with an anchor

```vue
<template>
  <UIPagination :items-per-page="10" :total="30" aria-label="Reports pages">
    <UIPaginationContent>
      <UIPaginationItem :value="1" :is-active="true" as-child>
        <a href="/reports?page=1" aria-label="Go to page 1">1</a>
      </UIPaginationItem>
      <UIPaginationItem :value="2" as-child>
        <a href="/reports?page=2" aria-label="Go to page 2">2</a>
      </UIPaginationItem>
    </UIPaginationContent>
  </UIPagination>
</template>
```

## References

- [Pagination](https://shadcn-vue.com/docs/components/pagination) for the official shadcn-vue installation and usage page
- [Pagination](https://reka-ui.com/docs/components/pagination) for the underlying API, accessibility behavior, and keyboard interactions
- [Button](../button/AGENTS.md) for the shared button variants and size values
