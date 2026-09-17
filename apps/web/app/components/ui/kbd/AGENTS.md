# Kbd

Displays a keyboard key or shortcut as styled text.

## Conclusion

Use `<UIKbd>` for one key or a compact shortcut label. Use `<UIKbdGroup>` for adjacent keys or shortcut labels. Both components are presentational native `<kbd>` elements. They do not listen for keys, trigger commands, or make another control accessible by themselves. The main gotcha is that `<UIKbdGroup>` also renders a `<kbd>` element, so it groups keyboard text visually without adding an ARIA group or keyboard behavior.

## Usage

```vue
<template>
  <UIKbd>Ctrl</UIKbd>
</template>
```

## Meaningful Information

- `index.ts` exports the `Kbd` and `KbdGroup` components. It exports no lowercase helpers or public type-only exports. The internal `HTMLAttributes` type import is not part of the component API.
- `shadcn-nuxt` auto-imports both components with the configured `UI` prefix. Use `<UIKbd>` and `<UIKbdGroup>` in templates without component imports. Import refs, helpers, types, icons, and third-party APIs explicitly when an example needs them.
- `Kbd` has one prop. `class` accepts `HTMLAttributes['class']` and defaults to no additional class.
- `KbdGroup` has the same `class` prop and default.
- Both components expose a default slot. Put key text or key icons in `<UIKbd>`. Put `<UIKbd>` elements and optional separators such as `<span>+</span>` in `<UIKbdGroup>`.
- `Kbd` renders `<kbd data-slot="kbd">`. `KbdGroup` renders `<kbd data-slot="kbd-group">`. The `class` prop is merged with the local classes through `cn`.
- Other attributes fall through to each native root element. This supports attributes such as `aria-label`, `aria-describedby`, `title`, and `data-*`. The declared `class` prop is merged rather than passed through unchanged.
- The native `<kbd>` element semantically identifies text that represents keyboard input. Use real buttons, links, and form controls for actions. A `<UIKbd>` inside a button labels the shortcut and does not replace the button label.
- The local `Kbd` styles set `pointer-events-none` and `select-none`. Treat it as display text, not as a focusable or clickable control.
- Shortcut text is literal slot content. Render platform-appropriate symbols such as `⌘`, `Ctrl`, `Alt`, `⇧`, `⌥`, `⌃`, `⏎`, and `Esc` when the product needs them. The components do not normalize labels for a platform or register the shortcut.
- `KbdGroup` does not insert separators or combine its children. Add a visible `<span>+</span>` or place the complete shortcut in one `<UIKbd>` when that is the desired presentation.
- `KbdGroup` does not provide `role="group"`, an accessible name, focus management, or keyboard event handling. Add those behaviors to the surrounding interactive component when the product needs them.
- `Kbd` adjusts its colors when it appears inside an element with `data-slot="tooltip-content"`. Keep the component inside the tooltip content when displaying a shortcut there so the contextual styles apply.
- The official page has Installation, Usage, Examples, and API Reference sections. It has no dedicated accessibility, semantics, or keyboard-event section. Those details come from the local components and native HTML behavior.
- The API has no `variant`, `size`, `disabled`, `v-model`, or event props. Do not invent component-specific props.

## Examples

```vue
<template>
  <div class="flex flex-col items-center gap-4">
    <UIKbdGroup>
      <UIKbd>⌘</UIKbd>
      <UIKbd>⇧</UIKbd>
      <UIKbd>⌥</UIKbd>
      <UIKbd>⌃</UIKbd>
    </UIKbdGroup>
    <UIKbdGroup>
      <UIKbd>Ctrl</UIKbd>
      <span>+</span>
      <UIKbd>B</UIKbd>
    </UIKbdGroup>
  </div>
</template>
```

```vue
<template>
  <div class="flex flex-wrap items-center gap-4">
    <UIButton variant="outline" size="sm" class="pr-2"> Accept <UIKbd>⏎</UIKbd> </UIButton>
    <UIButton variant="outline" size="sm" class="pr-2"> Cancel <UIKbd>Esc</UIKbd> </UIButton>
  </div>
</template>
```

```vue
<template>
  <UITooltipProvider>
    <UITooltip>
      <UITooltipTrigger as-child>
        <UIButton size="sm" variant="outline">Save</UIButton>
      </UITooltipTrigger>
      <UITooltipContent>
        <div class="flex items-center gap-2">Save Changes <UIKbd>S</UIKbd></div>
      </UITooltipContent>
    </UITooltip>
  </UITooltipProvider>
</template>
```

```vue
<template>
  <div class="flex w-full max-w-xs flex-col gap-6">
    <UIInputGroup>
      <UIInputGroupInput placeholder="Search..." aria-label="Search" />
      <UIInputGroupAddon align="inline-end">
        <UIKbd>⌘</UIKbd>
        <UIKbd>K</UIKbd>
      </UIInputGroupAddon>
    </UIInputGroup>
  </div>
</template>
```

## References

- [Kbd documentation](https://shadcn-vue.com/docs/components/kbd)
- [Local exports](./index.ts)
- [Kbd implementation](./Kbd.vue)
- [KbdGroup implementation](./KbdGroup.vue)
- [Button](../button/AGENTS.md)
- [Input Group](../input-group/AGENTS.md)
- [HTML `<kbd>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/kbd)
- [Tooltip documentation](https://shadcn-vue.com/docs/components/tooltip)
