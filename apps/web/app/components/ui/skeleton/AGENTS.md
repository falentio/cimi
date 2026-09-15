# Skeleton

Displays a pulsing placeholder that reserves the shape of content while it loads.

## Conclusion

`UISkeleton` renders one empty `<div>` with `data-slot="skeleton"`, `bg-muted`, `rounded-md`, and `animate-pulse`. Give it the dimensions and shape of the content it replaces, then remove it when the real content is ready. The component has no loading state of its own.

## Usage

Use the auto-imported `<UISkeleton>` tag in Nuxt templates.

```vue
<template>
  <UISkeleton class="h-4 w-[100px]" />
</template>
```

## Meaningful Information

- `index.ts` exports `Skeleton` from `Skeleton.vue`. The `shadcn-nuxt` configuration maps that export to `<UISkeleton>` with no component import because `apps/web/nuxt.config.ts` sets the prefix to `UI` and the component directory to `@/components/ui`.
- `UISkeleton` has one prop, `class?: HTMLAttributes['class']`. It has no default value.
- `class` is passed to `cn('bg-muted rounded-md animate-pulse', props.class)`. Tailwind conflict merging lets a supplied class replace a base class, so `rounded-full` replaces `rounded-md`.
- The root is a block-level `<div>` with no built-in width or height. An empty skeleton has no useful intrinsic size, so set `h-*` and `w-*`, use `size-*`, or size it through its parent layout.
- Use `h-4` with a width for a text line. Use `size-12 rounded-full` for a circular avatar placeholder. Use `w-full` or fractional widths when the placeholder follows a responsive container.
- The single root receives every undeclared native attribute, including `id`, `style`, `title`, `role`, `aria-*`, and `data-*`. Native event listeners such as `@click` also attach to that root. The declared `class` prop is merged into the root instead of falling through.
- The component has no slots. Child content passed to `<UISkeleton>` is not rendered.
- The component has no `v-model`, no declared events, and no emitted values. A `v-model` binding has no component state to update.
- The component renders no semantic role, accessible name, or loading announcement. Mark the loading region with `aria-busy="true"`, give that region an accessible name when needed, and add separate screen-reader text such as `Loading profile`.
- `animate-pulse` is always present in the base classes. The component has no animation prop. Add `motion-reduce:animate-none` to the `class` prop when the placeholder should stop pulsing for users who request reduced motion.
- `bg-muted` depends on the app's muted color token. Override it with a project color class when the placeholder needs a different surface.
- `disabled` has no native effect on the root `<div>`. Keep skeletons noninteractive and put event handlers on the real control that replaces them.
- Skeletons only describe the expected geometry. They do not fetch data, track loading, preserve content, or replace themselves. Render them from the same loading condition as the content they represent.

## Examples

**Text line.**

```vue
<template>
  <UISkeleton class="w-[100px] h-[20px] rounded-full" />
</template>
```

**Card shape.**

```vue
<template>
  <article class="space-y-4 rounded-xl border p-4" aria-hidden="true">
    <UISkeleton class="h-5 w-1/3" />
    <div class="space-y-2">
      <UISkeleton class="h-4 w-full" />
      <UISkeleton class="h-4 w-5/6" />
      <UISkeleton class="h-4 w-2/3" />
    </div>
  </article>
</template>
```

**Avatar with text lines.**

```vue
<template>
  <div class="flex items-center space-x-4">
    <UISkeleton class="h-12 w-12 rounded-full" />
    <div class="space-y-2">
      <UISkeleton class="h-4 w-[250px]" />
      <UISkeleton class="h-4 w-[200px]" />
    </div>
  </div>
</template>
```

**List rows.**

```vue
<template>
  <div class="space-y-6" aria-hidden="true">
    <div v-for="item in 3" :key="item" class="flex items-center gap-4">
      <UISkeleton class="size-10 rounded-full" />
      <div class="flex-1 space-y-2">
        <UISkeleton class="h-4 w-1/3" />
        <UISkeleton class="h-4 w-2/3" />
      </div>
    </div>
  </div>
</template>
```

The official page shows the text and avatar shapes. It does not show dedicated card or list examples. The card and list snippets above compose the same documented `<UISkeleton>` API with native layout elements.

## References

- [Local `Skeleton.vue`](./Skeleton.vue)
- [Local `index.ts`](./index.ts)
- [Skeleton documentation](https://shadcn-vue.com/docs/components/skeleton)
- [Card component guidance](../card/AGENTS.md)
- [Avatar component guidance](../avatar/AGENTS.md)
