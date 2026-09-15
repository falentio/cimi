# Scroll Area

Provides a native scroll container with styled, cross-browser scrollbars.

## Conclusion

Use `<UIScrollArea>` for a bounded scroll region. Give the root an explicit height, width, or both so its viewport has a size to scroll within.

The local wrapper renders the viewport, one vertical scrollbar, and the corner. Add `<UIScrollBar orientation="horizontal" />` inside `<UIScrollArea>` when the content must scroll horizontally. The wrapper has no scroll-position `v-model` and declares no custom events.

The component keeps native scrolling, including browser keyboard behavior. Give nested scroll areas independent bounds and style the internal viewport when you need to control scroll chaining.

## Usage

`shadcn-nuxt` auto-registers the `ScrollArea` and `ScrollBar` exports from `index.ts` with the `UI` prefix configured in [`nuxt.config.ts`](../../../../nuxt.config.ts). Use `<UIScrollArea>` and `<UIScrollBar>` in templates without component imports.

- `ScrollArea` becomes `<UIScrollArea>`.
- `ScrollBar` becomes `<UIScrollBar>`.

The barrel exports only Vue components. Import lowercase helpers and type-only exports explicitly when you use them. Prefix every other local UI component tag with `UI` too.

The required local composition is one `<UIScrollArea>` root with content in its default slot. The wrapper places that slot inside its internal viewport and adds a vertical `<UIScrollBar>` automatically. There is no local `ScrollAreaViewport`, `ScrollAreaThumb`, `ScrollAreaCorner`, or `ScrollAreaContent` export.

Keep an added horizontal `<UIScrollBar>` inside the `<UIScrollArea>` template. The scrollbar needs the scroll-area context, and the local wrapper provides it through the internal viewport.

## Meaningful Information

### Exports and composition

- `index.ts` exports `ScrollArea` from `ScrollArea.vue` and `ScrollBar` from `ScrollBar.vue`.
- `ScrollArea` wraps Reka UI `ScrollAreaRoot`, `ScrollAreaViewport`, `ScrollAreaCorner`, and a local vertical `ScrollBar`.
- `ScrollBar` wraps Reka UI `ScrollAreaScrollbar` and `ScrollAreaThumb`.
- `ScrollArea` accepts `ScrollAreaRootProps` plus `class`. It removes `class` before forwarding the remaining props to the Reka root, then merges the supplied class with `relative`.
- The internal viewport uses `size-full`, inherits the root radius, and receives the default slot. The viewport is the native scroll container.
- The scrollbar overlays the content and takes no layout space. The local thumb uses the `bg-border` token and a rounded shape.

### Root props

`ScrollArea` forwards these Reka UI root props.

| Prop              | Values or type                                              | Default                  | Use                                                      |
| ----------------- | ----------------------------------------------------------- | ------------------------ | -------------------------------------------------------- |
| `type`            | `"scroll"`, `"always"`, `"hover"`, `"auto"`, or `"glimpse"` | `"hover"`                | Controls when an overflowing scrollbar is visible.       |
| `scrollHideDelay` | `number` in milliseconds                                    | `600`                    | Sets the hide delay for `scroll` and `hover` visibility. |
| `dir`             | `"ltr"` or `"rtl"`                                          | Inherited, otherwise LTR | Sets the reading direction for the scroll area.          |
| `as`              | Reka UI element or component                                | `"div"`                  | Changes the root element.                                |
| `asChild`         | `boolean`                                                   | Unset                    | Merges root behavior into the supplied child element.    |
| `class`           | Vue `HTMLAttributes['class']`                               | Unset                    | Adds classes to the root.                                |

`type="auto"` shows a scrollbar when content overflows. `type="always"` keeps it visible. `type="scroll"` shows it while the user scrolls. `type="hover"` shows it while the user scrolls or hovers. `type="glimpse"` briefly shows it when the user enters the area, then hides it until another interaction.

### Scrollbar props

`ScrollBar` forwards `ScrollAreaScrollbarProps` and accepts a local `class` prop.

| Prop          | Values or type                 | Default      | Use                                                        |
| ------------- | ------------------------------ | ------------ | ---------------------------------------------------------- |
| `orientation` | `"vertical"` or `"horizontal"` | `"vertical"` | Selects the scroll axis.                                   |
| `forceMount`  | `boolean`                      | Unset        | Keeps the scrollbar mounted for custom animation control.  |
| `as`          | Reka UI element or component   | `"div"`      | Changes the scrollbar element.                             |
| `asChild`     | `boolean`                      | Unset        | Merges scrollbar behavior into the supplied child element. |
| `class`       | Vue `HTMLAttributes['class']`  | Unset        | Adds classes to the scrollbar.                             |

The local `ScrollArea` always adds one vertical scrollbar. Add exactly one horizontal scrollbar for horizontal overflow. Adding another vertical scrollbar creates duplicate controls.

### Viewport, content, and scroll state

Put content directly in the default slot. The wrapper renders that content inside `ScrollAreaViewport`, so content does not need a separate content component.

Set the root dimensions, then make the slotted content larger than the viewport in each axis that must scroll. Use a `w-max`, `min-w-*`, or equivalent width constraint for horizontal content. Use a `min-h-*` or enough content for vertical overflow.

Neither local wrapper declares `v-model` or custom emitted events. There is no model for scroll position. The native scroll event belongs to the internal viewport, not the wrapper root. The Reka docs list `scrollTop()` and `scrollTopLeft()` methods on the primitive root, but these wrappers do not expose those methods with `defineExpose`.

### Keyboard and accessibility

Reka UI keeps native scrolling, so keyboard scrolling works by default. Key behavior follows the browser and platform rather than a local event listener. Preserve the viewport composition and its focus-visible styles.

The wrapper does not add an accessible name. Give a distinct scroll region an appropriate label through the surrounding semantic markup or an explicit accessible attribute when the surrounding context does not name it. Keep the scrollbar inside the scroll-area context so the primitive can connect pointer controls to the native viewport.

### Nested scrolling

Give every nested `<UIScrollArea>` its own constrained size. In a flex or grid layout, add `min-h-0` or `min-w-0` to ancestors when the nested area must shrink instead of expanding with its content.

The root class lands on the root. Native overflow lives on the element marked `data-slot="scroll-area-viewport"`. Apply `overscroll-behavior` rules to that viewport when nested wheel or touch input must stop at one area instead of chaining to an outer area.

### Gotchas

- A root without a constrained size grows with its content and does not scroll.
- A horizontal scrollbar alone does not create horizontal overflow. The content must have a wider layout than the viewport.
- `scrollHideDelay` matters for `type="scroll"` and `type="hover"`. It does not make an `always` scrollbar disappear.
- `dir` belongs on `<UIScrollArea>`, not on the added `<UIScrollBar>`.
- The local components are auto-registered only in templates. Import lowercase helpers and type-only exports explicitly in script code.
- Reka's root methods are not part of the local wrapper's exposed instance. Use the primitive directly or change the wrapper deliberately when imperative scrolling is required.

### Documentation boundary

The shadcn-vue page has only installation and basic usage sections. It does not describe this project's `UI` prefix, built-in vertical scrollbar, forwarded props, or missing model and event API. Reka UI documents the primitive anatomy, props, methods, horizontal scrollbar pattern, and native keyboard behavior. It does not describe this local Nuxt wrapper or its slot placement. Use the local source as the authority for wrapper-specific behavior.

## Examples

### Vertical scrolling

The built-in vertical scrollbar handles this case.

```vue
<script setup lang="ts">
const paragraphs = [
  'The first paragraph has enough text to establish the scroll region.',
  'The second paragraph adds more content than the viewport can show at once.',
  'The third paragraph confirms that the viewport keeps the root size fixed.',
  'The fourth paragraph gives the user more content to reach with native scrolling.',
]
</script>

<template>
  <UIScrollArea class="h-40 w-full max-w-sm rounded-md border">
    <div class="flex flex-col gap-4 p-4">
      <p v-for="paragraph in paragraphs" :key="paragraph">{{ paragraph }}</p>
    </div>
  </UIScrollArea>
</template>
```

### Horizontal scrolling

Add the horizontal scrollbar and keep the content wider than the viewport.

```vue
<template>
  <UIScrollArea class="w-full max-w-md whitespace-nowrap rounded-md border">
    <div class="flex w-max gap-4 p-4">
      <div class="w-48 shrink-0 rounded-md border p-4">First panel</div>
      <div class="w-48 shrink-0 rounded-md border p-4">Second panel</div>
      <div class="w-48 shrink-0 rounded-md border p-4">Third panel</div>
    </div>
    <UIScrollBar orientation="horizontal" />
  </UIScrollArea>
</template>
```

### Scrolling in both directions

Give the content a minimum width and height, then add the horizontal scrollbar.

```vue
<template>
  <UIScrollArea class="h-48 w-full max-w-md rounded-md border">
    <div class="min-h-[32rem] min-w-[48rem] p-4">
      <div class="grid grid-cols-4 gap-4">
        <div class="h-24 rounded-md border p-4">Top-left</div>
        <div class="h-24 rounded-md border p-4">Top-right</div>
        <div class="h-24 rounded-md border p-4">Bottom-left</div>
        <div class="h-24 rounded-md border p-4">Bottom-right</div>
      </div>
    </div>
    <UIScrollBar orientation="horizontal" />
  </UIScrollArea>
</template>
```

## References

- [`index.ts`](./index.ts) lists the local component exports.
- [`ScrollArea.vue`](./ScrollArea.vue) defines the root, viewport, built-in vertical scrollbar, and corner composition.
- [`ScrollBar.vue`](./ScrollBar.vue) defines scrollbar props, orientation defaults, and thumb styling.
- [`nuxt.config.ts`](../../../../nuxt.config.ts) configures the `UI` prefix and component directory.
- [shadcn-vue Scroll Area documentation](https://shadcn-vue.com/docs/components/scroll-area)
- [Reka UI Scroll Area documentation](https://reka-ui.com/docs/components/scroll-area)
