# Resizable

Resizable divides a layout into keyboard-accessible panels that users can resize, nest, collapse, and persist.

## Conclusion

Compose `UIResizablePanelGroup`, `UIResizablePanel`, and `UIResizableHandle` as one tree. Set the required `direction` on each group, place a handle between adjacent panels, and use `default-size` with `min-size` or `max-size` to constrain the layout. The main gotchas are that `collapsible` requires both `min-size` and `collapsed-size`, persisted layouts take precedence over defaults, and Nuxt SSR may require explicit IDs for stable markup.

## Usage

Use the Nuxt auto-imported `UI`-prefixed component tags without component imports.

```vue
<template>
  <UIResizablePanelGroup direction="horizontal">
    <UIResizablePanel>One</UIResizablePanel>
    <UIResizableHandle />
    <UIResizablePanel>Two</UIResizablePanel>
  </UIResizablePanelGroup>
</template>
```

The group, panels, and handles must stay in the same composition tree. A handle separates two adjacent panels. Nest another `UIResizablePanelGroup` inside a panel when one region needs its own split layout.

## Meaningful Information

- `index.ts` exports exactly `ResizableHandle`, `ResizablePanel`, and `ResizablePanelGroup`. Each export is a Vue component. The barrel has no lowercase helpers or type-only exports.
- `UIResizablePanelGroup` wraps Reka UI `SplitterGroup`. Its required `direction` is `"horizontal"` or `"vertical"`. It also accepts `autoSaveId`, `id`, `keyboardResizeBy`, `storage`, `as`, `asChild`, and `class`.
- `UIResizablePanel` wraps Reka UI `SplitterPanel`. It accepts `defaultSize`, `minSize`, `maxSize`, `sizeUnit`, `collapsible`, `collapsedSize`, `order`, `id`, `as`, and `asChild`.
- `defaultSize` sets the initial panel size. Sizes use percentages by default. `minSize` defaults to `10`, and `maxSize` defaults to `100`.
- Set `size-unit="px"` when a panel needs fixed pixel sizing. `default-size`, `min-size`, `max-size`, and `collapsed-size` all use the selected unit.
- Set `collapsible` on a panel to collapse it when resizing reaches `minSize`. Supply both `min-size` and `collapsed-size`; the collapsed panel uses `collapsed-size`.
- `order` is required for a group whose panels render conditionally. Give every conditional panel a stable order so the group can restore its layout.
- `UIResizableHandle` wraps Reka UI `SplitterResizeHandle`. It accepts `disabled`, `hitAreaMargins`, `tabindex`, `id`, `nonce`, `as`, `asChild`, `class`, and the local `withHandle` prop.
- `with-handle` adds the local visual grip. Content in the handle's default slot renders inside that grip only when `with-handle` is true. Use the slot to add content inside the grip.
- `UIResizablePanelGroup` emits `layout` with the current `number[]` layout. Listen with `@layout` and store the array when another system owns persistence or needs the current sizes.
- `UIResizablePanel` emits `collapse`, `expand`, and `resize`. The resize event provides the new size and the previous size.
- `UIResizableHandle` emits `dragging` with a boolean that reports whether the handle is being dragged.
- These wrappers do not define a documented `v-model` for group layout or panel size. Use `@layout`, the panel events, or the panel's exposed methods instead of inventing a `v-model` binding.
- The panel default scoped slot exposes `isCollapsed`, `isExpanded`, `collapse`, `expand`, and `resize`. A panel template ref also exposes `collapse()`, `expand()`, `getSize()`, and `resize(size)`.
- `auto-save-id` saves the group layout to `localStorage`. Give each independent layout a stable, unique value. The saved layout takes precedence over `default-size` on later visits.
- Pass `storage` to replace the default `localStorage` adapter. Use `@layout` with your own ref or cookie when persistence must use a different store.
- The group uses the Window Splitter WAI-ARIA pattern. Handles are keyboard focusable with `tabindex="0"` by default.
- `ArrowDown` and `ArrowUp` resize a horizontal group. `ArrowRight` and `ArrowLeft` resize a vertical group. `Home` moves the primary panel to its smallest allowed size, and `End` moves it to its largest allowed size. `Enter` collapses a collapsible primary panel or restores its previous size. `keyboard-resize-by` defaults to `10`.
- In Nuxt SSR, provide stable unique `id` values for the group, every panel, and every handle when the runtime cannot generate matching server and client IDs. Wrap the tree in `ClientOnly` as the alternative.
- `UIResizablePanelGroup` and `UIResizableHandle` merge their local `class` prop with the base styles through `cn`. The wrappers add `data-slot` attributes named `resizable-panel-group`, `resizable-panel`, and `resizable-handle`.

## Examples

```vue
<template>
  <UIResizablePanelGroup direction="horizontal" class="min-h-32 rounded-lg border">
    <UIResizablePanel :default-size="50">
      <div class="flex h-32 items-center justify-center p-6">Main content</div>
    </UIResizablePanel>
    <UIResizableHandle />
    <UIResizablePanel :default-size="50">
      <div class="flex h-32 items-center justify-center p-6">Details</div>
    </UIResizablePanel>
  </UIResizablePanelGroup>
</template>
```

```vue
<template>
  <UIResizablePanelGroup direction="vertical" class="min-h-64 rounded-lg border">
    <UIResizablePanel :default-size="25">
      <div class="flex h-full items-center justify-center p-6">Top panel</div>
    </UIResizablePanel>
    <UIResizableHandle with-handle />
    <UIResizablePanel :default-size="75">
      <div class="flex h-full items-center justify-center p-6">Bottom panel</div>
    </UIResizablePanel>
  </UIResizablePanelGroup>
</template>
```

```vue
<template>
  <UIResizablePanelGroup direction="horizontal" class="min-h-64 rounded-lg border">
    <UIResizablePanel :default-size="50">
      <div class="flex h-full items-center justify-center p-6">One</div>
    </UIResizablePanel>
    <UIResizableHandle />
    <UIResizablePanel :default-size="50">
      <UIResizablePanelGroup direction="vertical">
        <UIResizablePanel :default-size="25">
          <div class="flex h-full items-center justify-center p-6">Two</div>
        </UIResizablePanel>
        <UIResizableHandle />
        <UIResizablePanel :default-size="75">
          <div class="flex h-full items-center justify-center p-6">Three</div>
        </UIResizablePanel>
      </UIResizablePanelGroup>
    </UIResizablePanel>
  </UIResizablePanelGroup>
</template>
```

```vue
<script setup lang="ts">
import { ref } from 'vue'

const layout = ref<number[]>([50, 50])
</script>

<template>
  <UIResizablePanelGroup
    direction="horizontal"
    auto-save-id="workspace-layout"
    @layout="layout = $event"
  >
    <UIResizablePanel :default-size="50">Editor</UIResizablePanel>
    <UIResizableHandle />
    <UIResizablePanel :default-size="50">Preview</UIResizablePanel>
  </UIResizablePanelGroup>
  <output>{{ layout.join(', ') }}</output>
</template>
```

For SSR-safe persistence, store the layout in a cookie and bind each panel's `default-size` to the cookie values.

```vue
<script setup lang="ts">
import { useCookie } from '#app'

const layout = useCookie<number[]>('resizable-layout', {
  default: () => [50, 50],
})
</script>

<template>
  <UIResizablePanelGroup id="resizable-group" direction="horizontal" @layout="layout = $event">
    <UIResizablePanel id="resizable-editor" :default-size="layout[0]">
      Editor
    </UIResizablePanel>
    <UIResizableHandle id="resizable-handle" />
    <UIResizablePanel id="resizable-preview" :default-size="layout[1]">
      Preview
    </UIResizablePanel>
  </UIResizablePanelGroup>
</template>
```

## References

- [shadcn-vue Resizable](https://shadcn-vue.com/docs/components/resizable)
- [Reka UI Splitter](https://reka-ui.com/docs/components/splitter)
- [Window Splitter WAI-ARIA pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter)
- [Collapsible](../collapsible/AGENTS.md) for a single panel that opens and closes without resizing a layout
