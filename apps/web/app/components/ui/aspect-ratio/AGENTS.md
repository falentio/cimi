# Aspect Ratio

Constrains a single child to a fixed width-to-height ratio.

## Conclusion

Reach for `UIAspectRatio` whenever a media element must keep a stable proportion across viewport widths. It is a thin wrapper over the reka-ui primitive and has no sub-parts, no variants, and no styling of its own, so sizing comes from `ratio` plus the child's own classes. Pass `ratio` as a division expression rather than a computed number literal, and give the child `h-full w-full object-cover` or it will not fill the box.

## Usage

```vue
<template>
  <UIAspectRatio :ratio="16 / 9">
    <img src="..." alt="Image" class="rounded-md object-cover">
  </UIAspectRatio>
</template>
```

## Meaningful Information

- Single export `AspectRatio` from `./index.ts`; `shadcn-nuxt` auto-imports it as `<UIAspectRatio>` with no import statement.
- Props, taken verbatim from `AspectRatioProps` (reka-ui): `ratio` (`number`, default `1`), `as` (`AsTag | Component`, default `"div"`), `asChild` (`boolean`).
- Pass `ratio` as an expression, for example `:ratio="16 / 9"`, `:ratio="4 / 3"`, `:ratio="1"`.
- Default slot exposes an `aspect` slot prop holding the current ratio in percent (`number`).
- Root element carries `data-slot="aspect-ratio"` for styling and test selectors.
- Exactly one child per root. Multiple children stack inside a single ratio box instead of producing separate boxes.
- Media children need `class="h-full w-full object-cover"` to fill and crop the box.
- `asChild` merges props and behavior into the passed child element; use it instead of wrapping the root in extra markup when a non-`div` root is required.
- No `v-model`, no events, no variants, no sizes. Set the ratio on the component, never via inline `height` or `aspect-ratio` CSS on the child.
- Accessibility is delegated entirely to the child, for example `alt` on the image.

## Examples

```vue
<!-- Image locked to 16:9 -->
<UIAspectRatio :ratio="16 / 9" class="bg-muted rounded-lg">
  <img
    src="https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&dpr=2&q=80"
    alt="Photo by Drew Beamer"
    class="h-full w-full rounded-lg object-cover dark:brightness-[0.2] dark:grayscale"
  >
</UIAspectRatio>
```

```vue
<!-- Square box -->
<UIAspectRatio :ratio="1" class="bg-muted rounded-md">
  <img src="..." alt="Image" class="h-full w-full object-cover">
</UIAspectRatio>
```

```vue
<!-- Read the current ratio from the slot -->
<UIAspectRatio v-slot="{ aspect }" :ratio="16 / 9">
  <img src="..." alt="Image" class="h-full w-full object-cover">
</UIAspectRatio>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/aspect-ratio)
- [reka-ui AspectRatio primitive](https://reka-ui.com/docs/components/aspect-ratio)
