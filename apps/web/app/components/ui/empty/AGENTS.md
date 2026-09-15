# Empty

Displays a centered empty-state placeholder when a collection, page, or panel has no content yet.

## Conclusion

`UIEmpty` is a flex column of styled `div`s that holds every other part, and only it is required to render. Reach for it when a list, table, or search result is empty and you want a title, an icon, and a call to action. The gotcha is nesting, not order: `UIEmptyHeader` groups the media, title, and description together, while `UIEmptyContent` holds interactive controls, and both are direct children of `UIEmpty` rather than nested inside one another.

## Usage

```vue
<template>
  <UIEmpty>
    <UIEmptyHeader>
      <UIEmptyTitle>No data</UIEmptyTitle>
      <UIEmptyDescription>No data found.</UIEmptyDescription>
    </UIEmptyHeader>
    <UIEmptyContent>
      <UIButton>Add data</UIButton>
    </UIEmptyContent>
  </UIEmpty>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIEmpty>`, `<UIEmptyHeader>`, `<UIEmptyMedia>`, `<UIEmptyTitle>`, `<UIEmptyDescription>`, and `<UIEmptyContent>` with no import.
- Exports from `@/components/ui/empty`: `Empty`, `EmptyContent`, `EmptyDescription`, `EmptyHeader`, `EmptyMedia`, `EmptyTitle`, `emptyMediaVariants`, type `EmptyMediaVariants`. Import `emptyMediaVariants` or `EmptyMediaVariants` explicitly from `@/components/ui/empty`; never assume auto-import.
- `UIEmpty` props: `class?: HTMLAttributes['class']`. Renders `<div data-slot="empty">` with `gap-4 rounded-xl border-dashed p-6 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance`. No `border` width by default; add `class="border border-dashed"` for an outline empty state.
- `UIEmptyHeader` props: `class`. Renders `<div data-slot="empty-header">` with `gap-2 flex max-w-sm flex-col items-center`. Groups `UIEmptyMedia`, `UIEmptyTitle`, and `UIEmptyDescription`.
- `UIEmptyMedia` props: `variant?: 'default' | 'icon'`, `class`. Default is `default`. Renders `<div data-slot="empty-icon" :data-variant="variant">`. `default` keeps the slot transparent, sized for an avatar or image. `icon` renders a `bg-muted` rounded square of `size-8` with icon color, and any `<svg>` without an explicit `size-*` class gets `size-4`.
- `UIEmptyTitle` props: `class`. Renders `<div data-slot="empty-title">` with `text-sm font-medium tracking-tight`.
- `UIEmptyDescription` props: `class`. Renders `<p data-slot="empty-description">` with `text-sm/relaxed text-muted-foreground` and underline styling for nested anchors. It reads `$attrs.class` instead of its own `class` prop, so a `class` attribute still lands correctly.
- `UIEmptyContent` props: `class`. Renders `<div data-slot="empty-content">` with `gap-2.5 text-sm flex w-full max-w-sm min-w-0 flex-col items-center text-balance`. Holds buttons, inputs, or links.
- Recommended structure: `UIEmpty` is the outer wrapper; put `UIEmptyHeader` (containing `UIEmptyMedia`, `UIEmptyTitle`, `UIEmptyDescription` in that order) and `UIEmptyContent` as its children. Every sub-part is optional, so `UIEmpty` alone renders a valid centered surface.
- `UIEmptyMedia variant="default"` (or an omitted `variant`) wraps an avatar, image, or badge at its own size. `variant="icon"` wraps a single icon and supplies the muted rounded background, so do not add a background class yourself.
- `UIEmpty` carries no ARIA role, no headings, and no landmarks. The title renders a `div`, so use real heading markup when the empty state must appear in the document outline.
- No `v-model`, no events, and no slots beyond the default slot on any part. All parts are presentational and forward only `class`.
- `UIEmpty` is `flex-1` and `w-full`, so it expands to fill its flex parent; constrain the parent when you want a smaller empty state.

## Examples

```vue
<!-- Intent: basic empty state with title, description, and a call to action -->
<template>
  <UIEmpty>
    <UIEmptyHeader>
      <UIEmptyTitle>No results</UIEmptyTitle>
      <UIEmptyDescription>Try adjusting your search or filters.</UIEmptyDescription>
    </UIEmptyHeader>
    <UIEmptyContent>
      <UIButton variant="outline" size="sm">Clear filters</UIButton>
    </UIEmptyContent>
  </UIEmpty>
</template>
```

```vue
<!-- Intent: icon variant with an outline surface -->
<script setup lang="ts">
import { FolderCode } from '@lucide/vue'
</script>

<template>
  <UIEmpty class="border border-dashed">
    <UIEmptyHeader>
      <UIEmptyMedia variant="icon">
        <FolderCode />
      </UIEmptyMedia>
      <UIEmptyTitle>No projects yet</UIEmptyTitle>
      <UIEmptyDescription>
        Get started by creating your first project.
      </UIEmptyDescription>
    </UIEmptyHeader>
    <UIEmptyContent>
      <UIButton size="sm">Create Project</UIButton>
    </UIEmptyContent>
  </UIEmpty>
</template>
```

```vue
<!-- Intent: default media variant holding an avatar -->
<template>
  <UIEmpty>
    <UIEmptyHeader>
      <UIEmptyMedia variant="default">
        <UIAvatar class="size-12">
          <UIAvatarImage src="https://github.com/zernonia.png" class="grayscale" />
          <UIAvatarFallback>ZN</UIAvatarFallback>
        </UIAvatar>
      </UIEmptyMedia>
      <UIEmptyTitle>User Offline</UIEmptyTitle>
      <UIEmptyDescription>
        This user is currently offline. You can leave a message or try again later.
      </UIEmptyDescription>
    </UIEmptyHeader>
    <UIEmptyContent>
      <UIButton size="sm">Leave Message</UIButton>
    </UIEmptyContent>
  </UIEmpty>
</template>
```

## References

- [Empty](https://shadcn-vue.com/docs/components/empty)
- [Button](../button/AGENTS.md) for the call to action inside `EmptyContent`
- [Avatar](../avatar/AGENTS.md) for the `default` media variant
