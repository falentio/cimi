# Button

Displays a button or any element styled to look like a button, and is the base building block for action triggers.

## Conclusion

Use `Button` for any clickable action, and switch `variant` for intent and `size` for scale instead of writing button styles by hand. It is a single component with no required sub-parts. The one gotcha that bites: the locally installed component supports more `size` values than the docs props table lists, so read the enumerations below rather than the docs table.

## Usage

```vue
<template>
  <UIButton variant="outline">Button</UIButton>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIButton>` in templates with no import. Helpers (`buttonVariants`), types (`ButtonVariants`), and the icon packages need explicit imports from `@/components/ui/button`.
- Render as a single self-closing or slotted element. Put label text and icons in the default slot. There are no sub-components.
- Props: `variant`, `size`, `as` (default `'button'`), `asChild` (default `false`), `class`.
- `variant` values: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. Defaults to `default`.
- `size` values: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. Defaults to `default`.
- The docs props table omits `xs` and `icon-xs`; they exist in local `index.ts` and are valid here.
- Set `asChild` to render the child element with button styling instead of a `<button>`. Exactly one child element is required. Use it to style a router link or `<a>`.
- Use the `as` prop to change the rendered element while keeping it a button role, for example `as="a"`. Prefer `asChild` for wrapping an existing component or router link.
- Merging classes: pass `class` to override styles, for example `class="rounded-full"` or `class="w-full"`.
- Icon and text spacing is automatic. Add no margin utility to the icon; the component adjusts gap per size.
- Icons inside the button inherit sizing. Icons default to `size-4`, scaling down for `xs`, `sm`, `icon-xs`, and `icon-sm`. Pass an explicit `size-*` class on the icon to override.
- Icon-only buttons need an accessible name. Add `aria-label` because there is no visible text.
- Events and v-model: the component is presentational. Bind native events with `@click`; there is no `v-model` and no value prop. For a toggle, use `UIToggle` or `UIToggleGroup` instead.
- Disabled state uses the native `disabled` attribute; styling and pointer events are handled automatically.
- Loading is not built in. Disable the button and render a `Spinner` in the slot manually.
- Cursor gotcha: Tailwind v4 sets `cursor: default` on buttons. To restore the pointer cursor, add the base layer rule from the docs Cursor section to your CSS file, or run `npx shadcn-vue@latest init --pointer`.
- Inside a `ButtonGroup`, the component reads the group slot to adjust corner rounding. Do not hand-set rounding on grouped buttons.
- For a group of related buttons, wrap them in `ButtonGroup` instead of stacking `Button` elements.
- Never fabricate props. Only `variant`, `size`, `as`, `asChild`, and `class` are supported.

## Examples

```vue
<!-- Intent: default action button -->
<template>
  <UIButton>Default</UIButton>
</template>
```

```vue
<!-- Intent: pick a variant for emphasis and intent -->
<template>
  <UIButton variant="outline">Outline</UIButton>
  <UIButton variant="secondary">Secondary</UIButton>
  <UIButton variant="ghost">Ghost</UIButton>
  <UIButton variant="destructive">Destructive</UIButton>
  <UIButton variant="link">Link</UIButton>
</template>
```

```vue
<!-- Intent: pick a size for scale, including icon-only -->
<script setup lang="ts">
import { ArrowUpIcon } from '@lucide/vue'
</script>

<template>
  <UIButton size="sm" variant="outline">Small</UIButton>
  <UIButton size="lg" variant="outline">Large</UIButton>
  <UIButton size="icon" variant="outline" aria-label="Submit">
    <ArrowUpIcon />
  </UIButton>
</template>
```

```vue
<!-- Intent: icon and label, no manual margin needed -->
<script setup lang="ts">
import { GitBranchIcon } from '@lucide/vue'
</script>

<template>
  <UIButton variant="outline" size="sm">
    <GitBranchIcon />
    New Branch
  </UIButton>
</template>
```

```vue
<!-- Intent: rendering a link as a button with asChild -->
<template>
  <UIButton as-child>
    <a href="/login">Login</a>
  </UIButton>
</template>
```

```vue
<!-- Intent: custom rounding and full width via class -->
<template>
  <UIButton variant="outline" class="rounded-full">Rounded</UIButton>
  <UIButton class="w-full">Full Width</UIButton>
</template>
```

```vue
<!-- Intent: loading state with Spinner, disabled manually -->
<template>
  <UIButton size="sm" variant="outline" disabled>
    <UISpinner class="animate-spin" />
    Submit
  </UIButton>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/button)
- [Button Group](../button-group/AGENTS.md) for groups of related buttons
- [Spinner](../spinner/AGENTS.md) for the loading example
- [Reka UI Primitive](https://reka-ui.com/docs/components/primitive), the primitive `Button` wraps
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide#buttons-use-the-default-cursor) for the cursor default change
