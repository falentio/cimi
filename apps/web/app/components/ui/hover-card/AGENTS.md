# Hover Card

Preview content behind a link on hover or focus.

## Conclusion

Compose `UIHoverCard` wrapping a `UIHoverCardTrigger` and a `UIHoverCardContent`; the trigger and content are both mandatory children. `UIHoverCardContent` already renders inside a portal and ships the positioning and animation classes, so pass only `class` for extra sizing such as `w-80`. The gotcha: it opens on hover or focus after `openDelay` (default 700ms) and closes after `closeDelay` (default 300ms), so use `as-child` on the trigger to wrap your own element, and do not rely on tap because touch is ignored unless `enableTouch` is set.

## Usage

```vue
<template>
  <UIHoverCard>
    <UIHoverCardTrigger as-child>
      <UIButton variant="link">@nuxt</UIButton>
    </UIHoverCardTrigger>
    <UIHoverCardContent class="w-80"> The Vue Framework. </UIHoverCardContent>
  </UIHoverCard>
</template>
```

## Meaningful Information

- Exports: `HoverCard` (root state, forwards `HoverCardRootProps` and `HoverCardRootEmits`), `HoverCardTrigger`, `HoverCardContent`. These three are the only components.
- Root props: `open` (`v-model:open`), `defaultOpen` (default `false`), `openDelay` (default `700`), `closeDelay` (default `300`), `enableTouch` (default `false`).
- Root emits `update:open` with `[value: boolean]`. Root slot exposes `open` as `boolean`.
- `enableTouch` toggles the card on tap for touch devices; leave it `false` to keep hover-only semantics.
- Trigger default element is `a`. Wrap your own element with `as-child`; the trigger merges its props and behavior onto that child.
- `HoverCardContent` props: `align` (`"start" | "center" | "end"`, default `center`), `side` (`"top" | "right" | "bottom" | "left"`), `sideOffset` (default `4`), `alignOffset`, `avoidCollisions`, `collisionBoundary`, `collisionPadding`, `sticky`, `hideWhenDetached`, `arrowPadding`, `positionStrategy`, `updatePositionStrategy`, `prioritizePosition`, `alignFlip`, `sideFlip`, `hideShiftedArrow`, `disableUpdateOnLayoutShift`, `memoDependencies`, `reference`, `dir`, `as`, `asChild`, `forceMount`, plus `class`.
- `HoverCardContent` emits `escapeKeyDown`, `focusOutside`, `interactOutside`, `pointerDownOutside`; all are preventable.
- `HoverCardContent` portals into `body`. It accepts no `Portal` props locally; configure teleport through root or the underlying content only if the local type carries them.
- CSS vars exposed for styling: `--reka-hover-card-trigger-width`, `--reka-hover-card-content-available-height`, `--reka-hover-card-content-transform-origin`.
- Collision state lands on `data-side` and `data-align` attributes, and open state on `data-open` / `data-closed`.
- Accessibility: sighted-users-only preview; keyboard users cannot read the content. Convey anything critical another way.

## Examples

```vue
<!-- Minimal: hover a link to preview content -->
<template>
  <UIHoverCard>
    <UIHoverCardTrigger>Hover</UIHoverCardTrigger>
    <UIHoverCardContent>
      The Vue Framework, created and maintained by Evan You.
    </UIHoverCardContent>
  </UIHoverCard>
</template>
```

```vue
<!-- Open instantly instead of waiting for openDelay -->
<template>
  <UIHoverCard :open-delay="0">
    <UIHoverCardTrigger>Hover</UIHoverCardTrigger>
    <UIHoverCardContent>Shown at once.</UIHoverCardContent>
  </UIHoverCard>
</template>
```

```vue
<!-- Profile preview: wrap a Button as the trigger -->
<template>
  <UIHoverCard>
    <UIHoverCardTrigger as-child>
      <UIButton variant="link">@nuxt</UIButton>
    </UIHoverCardTrigger>
    <UIHoverCardContent class="w-80">
      <div class="flex justify-between space-x-4">
        <UIAvatar>
          <UIAvatarImage src="https://github.com/vercel.png" />
          <UIAvatarFallback>VC</UIAvatarFallback>
        </UIAvatar>
        <div class="space-y-1">
          <h4 class="text-sm font-semibold">@nuxt</h4>
          <p class="text-sm">The Progressive Web Framework.</p>
        </div>
      </div>
    </UIHoverCardContent>
  </UIHoverCard>
</template>
```

```vue
<!-- Constrain content to the trigger width via the exposed CSS var -->
<template>
  <UIHoverCard>
    <UIHoverCardTrigger>Hover</UIHoverCardTrigger>
    <UIHoverCardContent
      class="w-(--reka-hover-card-trigger-width) max-h-(--reka-hover-card-content-available-height)"
    >
      Sized to the trigger.
    </UIHoverCardContent>
  </UIHoverCard>
</template>
```

## References

- [Hover Card](../hover-card/AGENTS.md)
- [Button](../button/AGENTS.md)
- [Avatar](../avatar/AGENTS.md)
- [Reka UI HoverCard](https://reka-ui.com/docs/components/hover-card)
- [shadcn-vue Hover Card](https://shadcn-vue.com/docs/components/hover-card)
