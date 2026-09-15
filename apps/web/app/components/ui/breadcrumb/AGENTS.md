# Breadcrumb

Shows the path to the current resource as a hierarchy of links.

## Conclusion

`UIBreadcrumb` is a semantic scaffold, not a data component, so you assemble every trail by hand from seven parts. Only `UIBreadcrumb` and `UIBreadcrumbList` are mandatory; items, separators, and the page marker are opt-in per level. The gotcha is that `UIBreadcrumbSeparator` already renders a default arrow icon, so passing a slot child replaces that icon rather than adding to it.

## Usage

```vue
<template>
  <UIBreadcrumb>
    <UIBreadcrumbList>
      <UIBreadcrumbItem>
        <UIBreadcrumbLink href="/">Home</UIBreadcrumbLink>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIBreadcrumbLink href="/components">Components</UIBreadcrumbLink>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIBreadcrumbPage>Breadcrumb</UIBreadcrumbPage>
      </UIBreadcrumbItem>
    </UIBreadcrumbList>
  </UIBreadcrumb>
</template>
```

## Meaningful Information

- `index.ts` exports seven components in this order: `Breadcrumb`, `BreadcrumbEllipsis`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbList`, `BreadcrumbPage`, `BreadcrumbSeparator`. All are PascalCase, so `shadcn-nuxt` auto-imports them as `UIBreadcrumb*` with no import statement.
- Required nesting: `UIBreadcrumb` holds `UIBreadcrumbList`, which holds `UIBreadcrumbItem` children. Never place `UIBreadcrumbItem` outside `UIBreadcrumbList`.
- `UIBreadcrumb` renders `<nav aria-label="breadcrumb" data-slot="breadcrumb">`. Keep one default slot child, the list.
- `UIBreadcrumbList` renders `<ol>` with `text-muted-foreground gap-1.5 text-sm flex flex-wrap items-center wrap-break-word`, so separators are siblings of items inside the list, not children of an item.
- `UIBreadcrumbItem` renders `<li>` with `gap-1 inline-flex items-center` and holds one link, page, ellipsis, or dropdown per item.
- `UIBreadcrumbLink` renders a reka-ui `Primitive` and is the only part with behavior props.
- Props on `UIBreadcrumbLink`: `as` (default `'a'`) and `asChild` (boolean) from reka-ui `PrimitiveProps`, plus `class`. No props exist on `UIBreadcrumb`, `UIBreadcrumbList`, `UIBreadcrumbItem`, `UIBreadcrumbPage`, `UIBreadcrumbSeparator`, or `UIBreadcrumbEllipsis` other than `class`.
- `asChild` is the only way to route through `NuxtLink`: write `<UIBreadcrumbLink as-child><NuxtLink to="/">Home</NuxtLink></UIBreadcrumbLink>`. A `href` goes on `UIBreadcrumbLink` itself only when it stays an `<a>`.
- `UIBreadcrumbPage` renders a `<span>` with `role="link" aria-disabled="true" aria-current="page"` and `text-foreground font-normal`. Use it for the final crumb and never wrap a link in it.
- Last `UIBreadcrumbItem` in the trail must hold `UIBreadcrumbPage`, not `UIBreadcrumbLink`.
- `UIBreadcrumbSeparator` renders `<li role="presentation" aria-hidden="true">` with `[&>svg]:size-3.5`, plus a default `ArrowRight01Icon` inside its default slot and `cn-rtl-flip` so the arrow mirrors in RTL. Put a custom icon in the default slot to replace the arrow.
- `UIBreadcrumbEllipsis` renders `<span role="presentation" aria-hidden="true">` with `size-5 [&>svg]:size-4 flex items-center justify-center`, a default `MoreHorizontalCircle01Icon`, and an `sr-only` "More" label. Place it inside a `UIBreadcrumbItem`.
- Collapsing is manual. `UIBreadcrumbEllipsis` only draws the marker, so pair it with `UIDropdownMenu` or `UIDrawer` and slice the items array yourself.
- Separators are decorative and hidden from assistive tech, so never put meaningful text in one.
- No `v-model`, no events, and no variants or sizes on any part. Every visual change goes through `class`.
- Style with `class` on any part; the component merges it last through `cn`, so utility overrides win.

## Examples

```vue
<!-- Plain trail ending in a page crumb -->
<template>
  <UIBreadcrumb>
    <UIBreadcrumbList>
      <UIBreadcrumbItem>
        <UIBreadcrumbLink href="/">Home</UIBreadcrumbLink>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIBreadcrumbPage>Breadcrumb</UIBreadcrumbPage>
      </UIBreadcrumbItem>
    </UIBreadcrumbList>
  </UIBreadcrumb>
</template>
```

```vue
<!-- Custom separator icon, importing only the icon -->
<script setup lang="ts">
import { SlashIcon } from '@lucide/vue'
</script>

<template>
  <UIBreadcrumb>
    <UIBreadcrumbList>
      <UIBreadcrumbItem>
        <UIBreadcrumbLink as-child>
          <NuxtLink to="/">Home</NuxtLink>
        </UIBreadcrumbLink>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator>
        <SlashIcon />
      </UIBreadcrumbSeparator>
      <UIBreadcrumbItem>
        <UIBreadcrumbPage>Breadcrumb</UIBreadcrumbPage>
      </UIBreadcrumbItem>
    </UIBreadcrumbList>
  </UIBreadcrumb>
</template>
```

```vue
<!-- Collapsed middle level behind a dropdown menu, helper state only in script -->
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <UIBreadcrumb>
    <UIBreadcrumbList>
      <UIBreadcrumbItem>
        <UIBreadcrumbLink as-child>
          <NuxtLink to="/">Home</NuxtLink>
        </UIBreadcrumbLink>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIDropdownMenu v-model:open="open">
          <UIDropdownMenuTrigger class="flex items-center gap-1" aria-label="Toggle menu">
            <UIBreadcrumbEllipsis />
          </UIDropdownMenuTrigger>
          <UIDropdownMenuContent align="start">
            <UIDropdownMenuItem>Documentation</UIDropdownMenuItem>
            <UIDropdownMenuItem>Themes</UIDropdownMenuItem>
          </UIDropdownMenuContent>
        </UIDropdownMenu>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIBreadcrumbPage>Breadcrumb</UIBreadcrumbPage>
      </UIBreadcrumbItem>
    </UIBreadcrumbList>
  </UIBreadcrumb>
</template>
```

```vue
<!-- Middle crumb opening a menu in place of a link -->
<template>
  <UIBreadcrumb>
    <UIBreadcrumbList>
      <UIBreadcrumbItem>
        <UIDropdownMenu>
          <UIDropdownMenuTrigger class="flex items-center gap-1">Components</UIDropdownMenuTrigger>
          <UIDropdownMenuContent align="start">
            <UIDropdownMenuItem>Documentation</UIDropdownMenuItem>
          </UIDropdownMenuContent>
        </UIDropdownMenu>
      </UIBreadcrumbItem>
      <UIBreadcrumbSeparator />
      <UIBreadcrumbItem>
        <UIBreadcrumbPage>Breadcrumb</UIBreadcrumbPage>
      </UIBreadcrumbItem>
    </UIBreadcrumbList>
  </UIBreadcrumb>
</template>
```

## References

- [Breadcrumb](https://shadcn-vue.com/docs/components/breadcrumb)
- [Primitive](https://reka-ui.com/docs/utilities/primitive)
- [Button](../button/AGENTS.md)
