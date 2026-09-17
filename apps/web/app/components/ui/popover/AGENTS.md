# Popover

A floating panel that opens from a trigger and renders its content in a body portal.

## Conclusion

Compose `<UIPopover>` with `<UIPopoverTrigger>` and `<UIPopoverContent>`. Add `<UIPopoverAnchor>` when the content should position against another element. Use `<UIPopoverHeader>`, `<UIPopoverTitle>`, and `<UIPopoverDescription>` to group the header. This folder does not export `PopoverClose`, so close local popovers through the root `close` slot prop or controlled state instead of using `<UIPopoverClose>`.

`<UIPopoverContent>` already renders `PopoverPortal`, applies the default positioning and animation classes, and mounts the content in `body`. Do not add a portal wrapper around it.

## Usage

```vue
<template>
  <UIPopover>
    <UIPopoverTrigger as-child>
      <button type="button">Open details</button>
    </UIPopoverTrigger>
    <UIPopoverContent class="w-80">
      <UIPopoverHeader>
        <UIPopoverTitle>Dimensions</UIPopoverTitle>
        <UIPopoverDescription> Set the dimensions for the layer. </UIPopoverDescription>
      </UIPopoverHeader>
      <p>Content goes here.</p>
    </UIPopoverContent>
  </UIPopover>
</template>
```

## Meaningful Information

- `shadcn-nuxt` auto-imports the component exports with the `UI` prefix. Templates use `<UIPopover>`, `<UIPopoverTrigger>`, `<UIPopoverAnchor>`, `<UIPopoverContent>`, `<UIPopoverHeader>`, `<UIPopoverTitle>`, and `<UIPopoverDescription>` with no component imports.
- `index.ts` exports `Popover`, `PopoverAnchor`, `PopoverContent`, `PopoverDescription`, `PopoverHeader`, `PopoverTitle`, and `PopoverTrigger`. Each export is a Vue component with a default export.
- The local barrel does not export `PopoverClose`, `PopoverPortal`, or `PopoverArrow`. The upstream Reka UI composition has those parts, but the matching local tags are unavailable here. Use the root `close` slot prop or set the controlled `open` value to `false` to close a local popover.
- Upstream `PopoverClose` is a button inside the content. It accepts `as` and `asChild` and closes the popover when activated. This project has no local `<UIPopoverClose>` wrapper, so add and export one before using that composition.
- `<UIPopover>` wraps the other parts. Use `<UIPopoverTrigger>` to toggle the popover. Use `<UIPopoverContent>` for the open panel. `<UIPopoverAnchor>` is optional and changes the element used for positioning.
- `<UIPopoverHeader>` renders a `div` with a vertical layout. It accepts `class` and forwards other attributes to that `div`.
- `<UIPopoverTitle>` renders a styled `div`, not a heading element. It accepts `class` and forwards other attributes to that `div`.
- `<UIPopoverDescription>` renders a styled `p`. It accepts `class` and forwards other attributes to that `p`.
- The project sets the `shadcn-nuxt` prefix to `UI` and the component directory to `@/components/ui` in `apps/web/nuxt.config.ts`. Keep component tags prefixed and use explicit imports for lowercase helpers such as `ref` and for type-only exports.

### Root state

- `<UIPopover>` forwards `PopoverRootProps` and `PopoverRootEmits` from `reka-ui`.
- `defaultOpen` sets the initial open state for an uncontrolled popover. Its default is `false`.
- `open` controls the state. Bind it with `v-model:open` when the parent owns visibility. Leave `v-model:open` off for uncontrolled state.
- `modal` defaults to `false`. Set `:modal="true"` to disable interaction with outside elements and expose only the popover content to screen readers. Keep the default when the page behind the popover must remain interactive.
- The root emits `update:open` with the new boolean value. Listen with `@update:open` when you need an effect in addition to `v-model:open`.
- The default slot exposes `open` and `close`. `open` is the current boolean state. `close` is a no-argument function that closes the popover.

### Trigger and anchor

- `<UIPopoverTrigger>` forwards `PopoverTriggerProps`. It renders a `button` by default. Use `as` to choose another element or `as-child` to merge the trigger behavior onto one child element.
- An `as-child` trigger child must keep the forwarded attributes, event handlers, and ref. Give the child an accessible name and button-like keyboard behavior when it is not a native button.
- `<UIPopoverAnchor>` forwards `PopoverAnchorProps`. It renders a `div` by default. Use `as-child` to use an existing element as the anchor.
- Pass `reference` to `<UIPopoverAnchor>` when a different element or virtual element must be used for positioning. Without an anchor, content positions against the trigger.

### Content and positioning

- `<UIPopoverContent>` forwards `PopoverContentProps` and `PopoverContentEmits`, accepts `class`, and renders inside `PopoverPortal`.
- The local wrapper defaults `align` to `center` and `side-offset` to `4`. It does not set a local default for `side`.
- `side` accepts `top`, `right`, `bottom`, or `left`. It is the preferred side and can change after collision handling.
- `align` accepts `start`, `center`, or `end`. `align-offset` moves the panel along the alignment axis.
- `side-offset` moves the panel away from the anchor. Pass numeric values in pixels, such as `:side-offset="8"`.
- `avoid-collisions` changes the preferred side or alignment to keep the panel inside its collision boundary. Use `collision-boundary` and `collision-padding` to change that boundary check. `side-flip`, `align-flip`, `sticky`, `prioritize-position`, and `hide-when-detached` refine collision behavior.
- `position-strategy` accepts `absolute` or `fixed`. `reference` replaces the default trigger or anchor reference. `dir` accepts `ltr` or `rtl`.
- Other forwarded content props include `arrow-padding`, `disable-outside-pointer-events`, `disable-update-on-layout-shift`, `hide-shifted-arrow`, `memo-dependencies`, and `update-position-strategy`. `disable-outside-pointer-events` makes an outside element require a second click after dismissal.
- `as` changes the rendered element. `as-child` merges the content behavior onto one child element. Use one child and keep its forwarded attributes and ref.
- `force-mount` keeps content mounted when it is closed. Use it when an animation library needs the closed DOM to remain present. The component still exposes its open and closed state through Reka UI data attributes.
- `class` is merged with the built-in classes. The wrapper starts with a `w-72` width, `max-w-(--reka-popover-content-available-width)`, padding, shadow, and open and closed animations. Add a width or other layout class when the default is not suitable.
- The underlying content exposes `data-state`, `data-side`, and `data-align`. It also exposes `--reka-popover-content-transform-origin`, `--reka-popover-content-available-width`, `--reka-popover-content-available-height`, `--reka-popover-trigger-width`, and `--reka-popover-trigger-height` for collision-aware styling.

### Events and focus

- `<UIPopoverContent>` emits `openAutoFocus`, `closeAutoFocus`, `escapeKeyDown`, `focusOutside`, `interactOutside`, and `pointerDownOutside`.
- Prevent any of those content events with `event.preventDefault()` when custom focus or dismissal behavior must replace the default behavior.
- Use kebab-case listeners in templates. For example, use `@open-auto-focus`, `@close-auto-focus`, `@escape-key-down`, `@focus-outside`, `@interact-outside`, and `@pointer-down-outside`.
- Space and Enter toggle the popover from its trigger. Escape closes the popover and returns focus to the trigger. Tab and Shift+Tab move through focusable elements.
- `modal` changes outside behavior. Modal mode disables outside interaction. Non-modal mode leaves outside content interactive, so prevent `focus-outside` or `interact-outside` only when that behavior is intentional.
- The component follows the Dialog WAI-ARIA design pattern. Keep a clear accessible name and description for content that needs them.
- The local title wrapper does not create a heading or connect itself to `aria-labelledby`. The local description wrapper does not connect itself to `aria-describedby`. Add stable `id` values and set those attributes on `<UIPopoverContent>` when the panel needs an explicit accessible name and description.

## Examples

```vue
<template>
  <UIPopover>
    <UIPopoverTrigger as-child>
      <button type="button">Open settings</button>
    </UIPopoverTrigger>
    <UIPopoverContent aria-labelledby="settings-title" aria-describedby="settings-description">
      <UIPopoverHeader>
        <UIPopoverTitle id="settings-title">Settings</UIPopoverTitle>
        <UIPopoverDescription id="settings-description">
          Change how this view behaves.
        </UIPopoverDescription>
      </UIPopoverHeader>
      <button type="button">Save</button>
    </UIPopoverContent>
  </UIPopover>
</template>
```

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <UIPopover v-model:open="open">
    <UIPopoverTrigger>Open controlled popover</UIPopoverTrigger>
    <UIPopoverContent>
      <UIPopoverTitle>Confirm</UIPopoverTitle>
      <button type="button" @click="open = false">Done</button>
    </UIPopoverContent>
  </UIPopover>
</template>
```

```vue
<template>
  <UIPopover v-slot="{ close }">
    <UIPopoverTrigger as-child>
      <button type="button">Open anchored popover</button>
    </UIPopoverTrigger>
    <UIPopoverContent
      side="right"
      align="start"
      :side-offset="8"
      :align-offset="4"
      force-mount
      class="w-80"
    >
      <UIPopoverHeader>
        <UIPopoverTitle>Actions</UIPopoverTitle>
        <UIPopoverDescription>
          This panel stays mounted for transition control.
        </UIPopoverDescription>
      </UIPopoverHeader>
      <button type="button" @click="close">Close</button>
    </UIPopoverContent>
  </UIPopover>
</template>
```

```vue
<template>
  <UIPopover default-open>
    <UIPopoverAnchor as-child>
      <div class="inline-flex items-center gap-2">
        <span>Anchor</span>
        <UIPopoverTrigger as-child>
          <button type="button">Toggle</button>
        </UIPopoverTrigger>
      </div>
    </UIPopoverAnchor>
    <UIPopoverContent> Content positions against the wrapper above the trigger. </UIPopoverContent>
  </UIPopover>
</template>
```

## References

- [shadcn-vue Popover documentation](https://shadcn-vue.com/docs/components/popover)
- [Reka UI Popover API reference](https://reka-ui.com/docs/components/popover)
- [Dialog WAI-ARIA design pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [`index.ts`](./index.ts) is the local export barrel.
- [`PopoverContent.vue`](./PopoverContent.vue) owns the portal, defaults, forwarded props, emits, and visual classes.
