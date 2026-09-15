# Tooltip

A tooltip displays brief information when its trigger receives keyboard focus or a pointer hover.

## Conclusion

Compose `<UITooltipProvider>` around `<UITooltip>`, then place a `<UITooltipTrigger>` and a `<UITooltipContent>` inside the root. The provider and trigger are required for the standard composition, and the content supplies the message. `<UITooltipContent>` already renders its portal and arrow, so do not add either wrapper yourself. Use a tooltip for supplemental information, not for required instructions or interactive controls.

## Usage

Use the `UI` prefix in templates. `shadcn-nuxt` auto-imports these components, so do not add component imports for the tags below.

```vue
<template>
  <UITooltipProvider>
    <UITooltip>
      <UITooltipTrigger as-child>
        <UIButton variant="outline">Hover me</UIButton>
      </UITooltipTrigger>
      <UITooltipContent>
        Add to library
      </UITooltipContent>
    </UITooltip>
  </UITooltipProvider>
</template>
```

## Meaningful Information

- `index.ts` exports exactly `Tooltip`, `TooltipContent`, `TooltipProvider`, and `TooltipTrigger`. Each export is a default Vue component. The barrel exports no lowercase helpers or types.
- `apps/web/nuxt.config.ts` sets the `shadcn-nuxt` prefix to `UI` and the component directory to `@/components/ui`. Use `<UITooltipProvider>`, `<UITooltip>`, `<UITooltipTrigger>`, `<UITooltipContent>`, and other `UI`-prefixed components such as `<UIButton>` without imports.
- The composition is `<UITooltipProvider>` containing one or more `<UITooltip>` roots. Each root contains a trigger and content. The content positions against the trigger unless you pass a different `reference` element to the trigger.
- `<UITooltipProvider>` forwards `TooltipProviderProps` and supplies defaults to every nested root. Its local default for `delayDuration` is `0`, which overrides Reka UI's upstream default of `700`. `skipDelayDuration` remains `300` unless you set it. The provider also accepts `disableHoverableContent`, `disableClosingTrigger`, `disabled`, `ignoreNonKeyboardFocus`, and `content` for default content settings.
- `delayDuration` is the pointer-hover delay in milliseconds. Set it on the provider for all nested tooltips, or set it on `<UITooltip>` to override the provider for one root.
- `skipDelayDuration` is provider-only. After one tooltip opens, entering another trigger within this interval skips the next pointer-hover delay. It makes a group of adjacent tooltips easier to scan.
- `disableHoverableContent` closes the tooltip as soon as the pointer leaves the trigger. Leave it unset when the pointer must travel from the trigger to the content. Disabling hoverable content has accessibility consequences because the content cannot remain open while the pointer crosses to it.
- `disableClosingTrigger` exists on both the provider and root. By default, activating the trigger closes an open tooltip. Set this prop to keep activation from closing it.
- `disabled` disables tooltip behavior at the provider or root. `ignoreNonKeyboardFocus` prevents focus that does not match `:focus-visible` from opening the tooltip.
- `<UITooltip>` forwards `TooltipRootProps` and `TooltipRootEmits`. `defaultOpen` sets the initial uncontrolled state and defaults to `false`. `open` controls visibility from the parent. Bind `v-model:open` when the parent owns that state. The root emits `update:open` with a boolean and exposes `open` through its default slot.
- `<UITooltipTrigger>` renders a `button` by default and forwards `TooltipTriggerProps`. Use `as` to select another element. Use `as-child` to merge the trigger behavior onto one child such as `<UIButton>` or an anchor. The child must accept the forwarded attributes, event handlers, and ref.
- `asChild` is also forwarded by `<UITooltipContent>`, and `as` can change its rendered element. The local content wrapper appends its own arrow after the slot, so keep the default content element unless a custom composition preserves the required single-child contract.
- `<UITooltipContent>` forwards `TooltipContentProps` and `TooltipContentEmits`, accepts `class`, and defaults its local `sideOffset` to `0`. The underlying tooltip defaults to `side="top"`, `align="center"`, and collision avoidance enabled.
- `side` accepts `top`, `right`, `bottom`, or `left`. `align` accepts `start`, `center`, or `end`. `sideOffset` moves content away from the trigger in pixels. `alignOffset` moves it along the alignment axis. Collision handling can change the resolved side or alignment.
- Content also forwards `avoidCollisions`, `collisionBoundary`, `collisionPadding`, `arrowPadding`, `sticky`, `hideWhenDetached`, `positionStrategy`, and `updatePositionStrategy`. `sticky` accepts `partial` or `always`. `positionStrategy` accepts `absolute` or `fixed`. `updatePositionStrategy` accepts `always` or `optimized`. Use these only when the default viewport collision behavior is not enough.
- `forceMount` keeps the content in the DOM while it is closed. Use it when a Vue animation library needs a mounted element. The content still exposes its closed state through `data-state`.
- The local content wrapper renders `TooltipPortal` and `TooltipArrow` internally. The barrel does not export either part, so no portal or arrow component is available here.
- `class` merges with the local content classes. The wrapper supplies the dark background, compact text, padding, z-index, collision-aware animations, and arrow styling. Add sizing or layout classes instead of replacing the composition.
- Content exposes `data-state` values of `closed`, `delayed-open`, or `instant-open`, plus `data-side` and `data-align`. It also exposes `--reka-tooltip-content-transform-origin`, `--reka-tooltip-content-available-width`, `--reka-tooltip-content-available-height`, `--reka-tooltip-trigger-width`, and `--reka-tooltip-trigger-height` for collision-aware styling.
- The root emits `update:open`. The content emits `escapeKeyDown` and `pointerDownOutside`. Use `@update:open`, `@escape-key-down`, and `@pointer-down-outside` in templates. Call `event.preventDefault()` in a preventable content handler when custom dismissal behavior must replace the default.
- Mouse pointer movement opens the tooltip after `delayDuration`. Keyboard focus opens it without that delay. `Tab` opens or closes the tooltip without delay. `Space` and `Enter` close an open tooltip, and `Escape` closes it. Tooltip content does not trap focus.
- The trigger receives `aria-describedby` while its content is open. The content exposes `role="tooltip"` through its hidden accessible label and derives that label from its text unless you pass `aria-label`. Give every trigger an accessible name, especially an icon-only trigger.
- Keep tooltip text short and supplementary. Put required instructions, status, or interactive controls in visible content or a component designed for interaction, such as the popover documented in [`../popover/AGENTS.md`](../popover/AGENTS.md).
- Touch pointer movement is ignored by the trigger. A tap or long press does not provide the hover path that opens a tooltip, so do not make touch users depend on tooltip text. Give the control a visible label or provide the information through another touch-friendly interaction.
- A disabled native button does not emit the pointer events a trigger needs. Wrap it in a focusable element with `as-child`, set the disabled button's pointer events to `none`, and put the tooltip trigger behavior on the wrapper.
- Opening one tooltip closes another through the shared provider event. Scrolling the trigger out of view also closes its tooltip.
- `SidebarProvider` already supplies a zero-delay `TooltipProvider`. Tooltips inside the sidebar do not need a second provider.
- The shadcn-vue page documents installation and basic usage only. Use the Reka UI reference and the local wrappers for props, events, defaults, and behavior.

## Examples

**Configure one provider.**

```vue
<template>
  <UITooltipProvider
    :delay-duration="600"
    :skip-delay-duration="300"
  >
    <div class="flex gap-2">
      <UITooltip>
        <UITooltipTrigger as-child>
          <UIButton variant="outline">First</UIButton>
        </UITooltipTrigger>
        <UITooltipContent>First action</UITooltipContent>
      </UITooltip>
      <UITooltip>
        <UITooltipTrigger as-child>
          <UIButton variant="outline">Second</UIButton>
        </UITooltipTrigger>
        <UITooltipContent>Second action</UITooltipContent>
      </UITooltip>
    </div>
  </UITooltipProvider>
</template>
```

**Name an icon-only button.**

```vue
<template>
  <UITooltipProvider>
    <UITooltip>
      <UITooltipTrigger as-child>
        <UIButton
          size="icon"
          variant="outline"
          aria-label="Copy link"
        >
          <span aria-hidden="true">⧉</span>
        </UIButton>
      </UITooltipTrigger>
      <UITooltipContent>Copy link</UITooltipContent>
    </UITooltip>
  </UITooltipProvider>
</template>
```

**Choose a side and delay.**

```vue
<template>
  <UITooltipProvider>
    <UITooltip :delay-duration="250">
      <UITooltipTrigger>Hover for details</UITooltipTrigger>
      <UITooltipContent
        side="right"
        align="start"
        :side-offset="8"
      >
        Shown on the preferred right side.
      </UITooltipContent>
    </UITooltip>
  </UITooltipProvider>
</template>
```

**Control the open state.**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <UITooltipProvider>
    <UITooltip v-model:open="open">
      <UITooltipTrigger>Toggle help</UITooltipTrigger>
      <UITooltipContent>Controlled tooltip content</UITooltipContent>
    </UITooltip>
  </UITooltipProvider>
</template>
```

## References

- [shadcn-vue Tooltip documentation](https://shadcn-vue.com/docs/components/tooltip)
- [Reka UI Tooltip API reference](https://reka-ui.com/docs/components/tooltip)
- [`index.ts`](./index.ts) is the local export barrel.
- [`Tooltip.vue`](./Tooltip.vue) forwards root props and emits.
- [`TooltipProvider.vue`](./TooltipProvider.vue) sets the local zero-millisecond delay default.
- [`TooltipTrigger.vue`](./TooltipTrigger.vue) forwards trigger props and behavior.
- [`TooltipContent.vue`](./TooltipContent.vue) owns the portal, arrow, local content defaults, events, and visual classes.
- [`../button/AGENTS.md`](../button/AGENTS.md) documents the button used by the examples.
- [`../popover/AGENTS.md`](../popover/AGENTS.md) covers interactive floating content that should not be placed in a tooltip.
