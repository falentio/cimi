# Spinner

Displays an accessible, animated loading indicator for a pending operation.

## Conclusion

Use `<UISpinner>` for indeterminate work that has not finished. The local component renders the Hugeicons loading icon with `role="status"`, `aria-label="Loading"`, `size-4`, and `animate-spin`. The component has no loading state of its own, so the parent controls when it appears and what remains disabled.

## Usage

Use the auto-imported `<UISpinner>` tag in Nuxt templates.

```vue
<template>
  <UISpinner />
</template>
```

## Meaningful Information

- `index.ts` exports `Spinner` from `Spinner.vue`. The `shadcn-nuxt` configuration maps that export to `<UISpinner>` because `apps/web/nuxt.config.ts` sets the prefix to `UI` and the component directory to `@/components/ui`.
- Use `<UISpinner>` without a component import. Lowercase helpers and type-only exports need explicit imports.
- `class` is the only declared prop. Its local type is `HTMLAttributes['class']`, while the official API reference lists it as `string`.
- The component has no `size`, `color`, `loading`, or icon prop. Use `class` to set those visual details.
- The default class is `size-4 animate-spin`. `cn` merges the supplied class after the defaults with `clsx` and `tailwind-merge`, so a conflicting utility such as `size-6` replaces `size-4`.
- Use `size-*` utilities to change the icon size. Use `text-*` utilities to change its color because the icon uses the current text color.
- `animate-spin` is always present by default. Add `motion-reduce:animate-none` when the spinner must stop for users who request reduced motion.
- The root is a `HugeiconsIcon` component that renders the `Loading03Icon`. Undeclared attributes fall through to that root, including `id`, `style`, `title`, `data-*`, and `aria-*` attributes. Native event listeners also fall through, but the spinner is not interactive.
- The component sets `role="status"` and `aria-label="Loading"`. Use the default label for a standalone spinner. When nearby text already names the operation, add `aria-hidden="true"` so assistive technology reads the text once.
- `disabled` does not disable the icon. Put `disabled` on the surrounding `<UIButton>` or form control.
- The component has no slots. Child content passed to `<UISpinner>` is not rendered.
- The component has no `v-model`, declared events, or emitted values. It only displays while its parent renders it.
- The official Customization section replaces the loading icon by editing the component. This local implementation uses `Loading03Icon` from `@hugeicons/core-free-icons`, so do not add an icon prop without changing `Spinner.vue`.
- The official page documents standalone, size, color, button, badge, input group, empty, and item examples. It has no dedicated sections for native attribute forwarding, slots, `v-model`, events, accessible labeling, reduced motion, or page loading. The input group example below is the documented field-style loading case.

## Examples

### Standalone loading

```vue
<template>
  <UISpinner />
</template>
```

### Button loading

Disable the action while it is pending and keep the visible button label.

```vue
<template>
  <UIButton disabled>
    <UISpinner aria-hidden="true" />
    Processing payment
  </UIButton>
</template>
```

### Input field loading

The official Input Group example places the spinner in an end-aligned addon while the input is disabled.

```vue
<template>
  <UIInputGroup>
    <UIInputGroupInput placeholder="Send a message..." disabled aria-label="Message" />
    <UIInputGroupAddon align="inline-end">
      <UISpinner aria-hidden="true" />
    </UIInputGroupAddon>
  </UIInputGroup>
</template>
```

## References

- [Local `Spinner.vue`](./Spinner.vue)
- [Local `index.ts`](./index.ts)
- [Button](../button/AGENTS.md) for disabled action loading
- [Input Group](../input-group/AGENTS.md) for the field loading composition
- [Official Spinner documentation](https://shadcn-vue.com/docs/components/spinner)
