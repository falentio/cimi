# Badge

Renders a short status label, count, or tag inline beside other content.

## Conclusion

`UIBadge` is a styled Reka `Primitive` wrapping a `<slot />`, so any single element or component can become a badge via `as-child`. It is one flat component with no sub-parts and no `size` prop; sizing comes only from `variant` plus utility classes. The gotcha is that content is placed in the default slot, so an interactive badge needs `as-child` with an `<a>` or `<button>` child rather than a `href` on the badge itself.

## Usage

```vue
<template>
  <UIBadge variant="secondary">Secondary</UIBadge>
</template>
```

## Meaningful Information

- Exports: `Badge` (component), `badgeVariants` (cva function), `BadgeVariants` (type).
- Props: `variant`, `class`, plus all Reka `PrimitiveProps` (`as`, `asChild`).
- `variant` enumerations: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. Default is `default`.
- No `size` prop exists; use `class` such as `h-5 min-w-5 rounded-full px-1 font-mono tabular-nums` for count badges.
- `as` defaults to `div`; `asChild` defaults to `false` and merges props and behavior onto the child element.
- Slot: a single default slot. Put text content or an icon element inside it.
- Render on `<a>` via `<UIBadge as-child><a href="#">Badge</a></UIBadge>`.
- When wrapping a link, variant hover styles apply to the `[a]` child automatically.
- Inline icons size via `[&>svg]:size-3`; pass `data-icon="inline-start"` or `data-icon="inline-end"` on the icon to tighten padding.
- Custom colors override tokens with `class`, e.g. `class="bg-blue-500 text-white dark:bg-blue-600"`.
- Accessibility: `aria-invalid` styling is built in; add `aria-label` when the badge conveys status without readable text.
- No `v-model`, no events, and no library-managed ARIA roles.

## Examples

```vue
<!-- Static label with a variant -->
<template>
  <UIBadge variant="destructive">Destructive</UIBadge>
</template>
```

```vue
<!-- Icon plus label, importing only the icon -->
<script setup lang="ts">
import { BadgeCheckIcon } from '@lucide/vue'
</script>

<template>
  <UIBadge variant="secondary" class="bg-blue-500 text-white dark:bg-blue-600">
    <BadgeCheckIcon />
    Verified
  </UIBadge>
</template>
```

```vue
<!-- Numeric count badge -->
<template>
  <UIBadge class="h-5 min-w-5 rounded-full px-1 font-mono tabular-nums">
    8
  </UIBadge>
</template>
```

```vue
<!-- Interactive link styled as a badge -->
<template>
  <UIBadge as-child>
    <a href="#">Badge</a>
  </UIBadge>
</template>
```

```vue
<!-- Reading badgeVariants for a custom element -->
<script setup lang="ts">
import { badgeVariants } from '@/components/ui/badge'
</script>

<template>
  <span :class="badgeVariants({ variant: 'outline' })">Outline</span>
</template>
```

## References

- [Badge](https://www.shadcn-vue.com/docs/components/badge)
- [Primitive](https://reka-ui.com/docs/utilities/primitive)
- [Button](../button/AGENTS.md)
