# Marker

Composes inline notes, status updates, labeled separators, and bordered rows in conversation-style interfaces.

## Conclusion

Use `UIMarker` as the root and add `UIMarkerIcon` for an optional decorative icon and `UIMarkerContent` for the readable content. Use `variant="separator"` for a labeled divider and `variant="border"` for a row with a bottom border. Use `as-child` when the whole marker must be a link or button. The local API uses `as-child`, not the official page's `render` prop wording.

## Usage

The `shadcn-nuxt` module auto-imports these components with the `UI` prefix configured in `apps/web/nuxt.config.ts`. Do not import the components in a Vue template.

```vue
<template>
  <UIMarker>
    <UIMarkerIcon>
      <span aria-hidden="true">✓</span>
    </UIMarkerIcon>
    <UIMarkerContent>Changes saved</UIMarkerContent>
  </UIMarker>
</template>
```

## Meaningful Information

- The component exports are `Marker`, `MarkerIcon`, and `MarkerContent`. Use them as `UIMarker`, `UIMarkerIcon`, and `UIMarkerContent` in templates.
- The non-component exports are `markerVariants` and the `MarkerVariants` type. Import them explicitly from `@/components/ui/marker` when a script uses them. Import `MarkerVariants` with `import type`.
- `markerVariants` is the cva class builder used by the root. `MarkerVariants['variant']` is the root variant type.
- `UIMarker` accepts `variant`, `class`, `as`, and `as-child`. It also accepts the other fallthrough attributes supported by the underlying Reka `Primitive`.
- `variant` values are `default`, `separator`, and `border`. Omitting `variant` gives the default inline marker.
- `default` keeps the root as an inline marker with muted text. `separator` adds flexible divider lines before and after the content. `border` adds a bottom border and bottom padding.
- `as` changes the root element. The default root is a `div`.
- `as-child` uses the one child element as the root. Use it with an anchor or button when the marker itself is interactive. The prop is written as `as-child` in a template and defaults to `false`.
- `UIMarkerIcon` accepts `class` and has one default slot. It renders a `span` with `aria-hidden="true"`, a fixed `size-4` box, and `shrink-0`.
- `UIMarkerContent` accepts `class` and has one default slot. It renders a `span` with `min-w-0` and `wrap-break-word`, so long content can wrap inside the marker.
- `UIMarker` has one default slot. There are no named slots. Put `UIMarkerIcon` before `UIMarkerContent` for the usual row layout.
- The root renders `data-slot="marker"` and `data-variant`. The subcomponents render `data-slot="marker-icon"` and `data-slot="marker-content"`. The content styles read the root variant through the `group/marker` class.
- The components declare no `v-model` bindings and no custom emitted events. Use native listeners such as `@click` on the rendered anchor or button.
- `UIMarker` is presentational without a role. Add `role="status"` when changing status or progress text must be announced by assistive technology.
- A labeled separator needs no `role="separator"`. Its label remains ordinary readable content. Use `role="separator"` only for a divider with no meaningful text and provide the needed accessible name.
- `UIMarkerIcon` is always hidden from assistive technology. Keep the meaning in `UIMarkerContent`, or add an accessible name such as `aria-label="Synced"` to an icon-only root marker.
- Use `as-child` with a real `<a>` for navigation or a real `<button type="button">` for an action. The visible marker content supplies the accessible name.
- Do not nest another link or button inside a marker that renders as an anchor or button.
- The root is `w-full`, uses a flex row, and has a `gap-2`. The icon stays at `size-4`, while the content can shrink and wrap.
- The component has no breakpoint-specific layout. It fills its parent width and responds to available space through flex sizing and text wrapping. Add a class such as `flex-col` to stack the icon above the content.
- The `separator` lines are CSS pseudo-elements that grow to fill the available width. `UIMarkerContent` becomes fixed-width and centered for that variant.
- Every part accepts `class` for local utility overrides. The root's class is merged with the selected variant classes, and the icon and content classes are merged with their defaults.
- The official API table describes a `render` prop, but this local Vue source imports Reka `Primitive` and exposes `as` and `asChild`. Use the local props shown above.

## Examples

Use the default composition for a readable note or status row.

```vue
<script setup lang="ts">
import { GitBranchIcon } from '@lucide/vue'
</script>

<template>
  <UIMarker>
    <UIMarkerIcon>
      <GitBranchIcon />
    </UIMarkerIcon>
    <UIMarkerContent>Switched to a new branch</UIMarkerContent>
  </UIMarker>
</template>
```

Choose a variant for the row's visual role.

```vue
<template>
  <div class="flex w-full max-w-sm flex-col gap-4">
    <UIMarker>
      <UIMarkerContent>Default inline note</UIMarkerContent>
    </UIMarker>
    <UIMarker variant="separator">
      <UIMarkerContent>Today</UIMarkerContent>
    </UIMarker>
    <UIMarker variant="border">
      <UIMarkerContent>Reviewed 8 related files</UIMarkerContent>
    </UIMarker>
  </div>
</template>
```

Use `role="status"` for changing text. Add the `shimmer` utility class when the app has that utility installed.

```vue
<template>
  <UIMarker role="status">
    <UIMarkerContent class="shimmer">Thinking...</UIMarkerContent>
  </UIMarker>
</template>
```

Render the whole marker as a link or button with `as-child`.

```vue
<template>
  <div class="flex flex-col gap-4">
    <UIMarker as-child>
      <a href="/pull-request/42">
        <UIMarkerIcon>
          <span aria-hidden="true">↗</span>
        </UIMarkerIcon>
        <UIMarkerContent>View the pull request</UIMarkerContent>
      </a>
    </UIMarker>
    <UIMarker as-child>
      <button type="button" class="transition-colors hover:text-foreground">
        <UIMarkerIcon>
          <span aria-hidden="true">↶</span>
        </UIMarkerIcon>
        <UIMarkerContent>Revert this change</UIMarkerContent>
      </button>
    </UIMarker>
  </div>
</template>
```

Use `flex-col` when the icon should sit above the content.

```vue
<template>
  <UIMarker class="flex-col">
    <UIMarkerIcon>
      <span aria-hidden="true">✓</span>
    </UIMarkerIcon>
    <UIMarkerContent>Syncing completed</UIMarkerContent>
  </UIMarker>
</template>
```

Use `markerVariants` when a custom element needs the same root styles.

```vue
<script setup lang="ts">
import { markerVariants } from '@/components/ui/marker'
</script>

<template>
  <div :class="markerVariants({ variant: 'border' })">Custom bordered marker</div>
</template>
```

## References

- [Marker documentation](https://shadcn-vue.com/docs/components/marker)
- [Primitive documentation](https://reka-ui.com/docs/utilities/primitive)
- [Button](../button/AGENTS.md) for action controls used inside marker content
