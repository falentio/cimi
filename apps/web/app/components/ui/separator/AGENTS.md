# Separator

Separates nearby content with a horizontal or vertical visual line and optional separator semantics.

## Conclusion

Use `UISeparator` for dividers between content sections or items instead of a raw `<hr>` or a border utility. The local wrapper renders a horizontal, decorative separator by default. Set `orientation="vertical"` for a divider in a row, and set `:decorative="false"` when the divider carries meaningful structure for assistive technology.

## Usage

```vue
<template>
  <UISeparator class="my-4" />
</template>
```

## Meaningful Information

- `index.ts` exports only `Separator`. `shadcn-nuxt` auto-imports it as `<UISeparator>` because `apps/web/nuxt.config.ts` sets the `UI` prefix and `@/components/ui` component directory. Do not import the component in a template.
- The local wrapper is `Separator.vue`. It wraps the Reka UI separator primitive and adds `data-slot="separator"`.
- Props are `orientation`, `decorative`, `as`, `asChild`, and `class`.
- `orientation` accepts `"horizontal"` or `"vertical"`. The local default is `"horizontal"`. It also sets `data-orientation` on the rendered element.
- `decorative` accepts a boolean. The local default is `true`, so the default separator is removed from the accessibility tree. Bind `:decorative="false"` when the divider represents a meaningful boundary.
- `as` changes the rendered element or component. Its default is `"div"`.
- `asChild` merges the separator props and behavior into exactly one child element or component. Use the template spelling `as-child`. The child must accept the forwarded attributes and preserve the separator semantics.
- `class` merges with the local classes through `cn`. The wrapper always adds `shrink-0 bg-border`. Horizontal separators also get `h-px w-full`. Vertical separators get `w-px self-stretch`.
- A horizontal separator fills the available width and is one pixel tall. Add margin with `class`, because the component does not add spacing around itself.
- A vertical separator is one pixel wide and stretches along its flex parent. Give the parent a height or a stretched cross axis. A vertical separator cannot create its own height.
- The component has no default content slot. Render it as a self-closing component unless you use `as-child`, which requires one child.
- The component has no `v-model`, model value, or component-specific events. It has no interactive state. Native attributes can be forwarded, but a separator does not need event handlers.
- Reka UI applies the `separator` role requirements when `decorative` is `false`. Use a semantic heading or landmark to name the content sections themselves. Use `decorative` for a line that only improves visual grouping.
- The local index has no lowercase helpers or type-only exports. Import any Reka UI types directly from `reka-ui` only in code that needs those types.

## Examples

Use the default horizontal layout for a divider between stacked content.

```vue
<template>
  <div>
    <h2 class="text-sm font-medium">Radix Primitives</h2>
    <p class="text-sm text-muted-foreground">An open-source UI component library.</p>
    <UISeparator class="my-4" />
    <p class="text-sm">Read the documentation to continue.</p>
  </div>
</template>
```

Use a vertical separator inside a row with a defined height.

```vue
<template>
  <div class="flex h-5 items-center gap-4 text-sm">
    <a href="/blog">Blog</a>
    <UISeparator orientation="vertical" />
    <a href="/docs">Docs</a>
    <UISeparator orientation="vertical" />
    <a href="/source">Source</a>
  </div>
</template>
```

Mark a divider as decorative when it adds no information beyond the surrounding layout.

```vue
<template>
  <div class="flex flex-col gap-4">
    <span>Filters</span>
    <UISeparator decorative />
    <span>Results</span>
  </div>
</template>
```

## References

- [Local `Separator.vue`](./Separator.vue)
- [Local export index](./index.ts)
- [Button Group guide](../button-group/AGENTS.md) for the grouped separator wrapper
- [Item guide](../item/AGENTS.md) for separators between list items
- [shadcn-vue Separator documentation](https://shadcn-vue.com/docs/components/separator)
- [Reka UI Separator documentation](https://reka-ui.com/docs/components/separator)
