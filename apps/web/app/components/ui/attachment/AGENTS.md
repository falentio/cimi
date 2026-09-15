# Attachment

Displays a file or image with media, name, metadata, upload state, and actions.

## Conclusion

`Attachment` is a CSS-only card built from composable parts, with no v-model and no external state. Reach for it whenever a file or image needs a media preview, title, description, and optional action buttons. `AttachmentMedia`, `AttachmentContent`, and `AttachmentTitle` cover the common case; `AttachmentActions`, `AttachmentAction`, `AttachmentTrigger`, and `AttachmentGroup` are optional. The gotcha is the `state` prop, which defaults to `"done"` and drives shimmer, border, and destructive styling purely through `data-state`, so pass it explicitly whenever an upload is in progress or failed.

## Usage

```vue
<template>
  <UIAttachment>
    <UIAttachmentMedia>
      <FileTextIcon />
    </UIAttachmentMedia>
    <UIAttachmentContent>
      <UIAttachmentTitle>sales-dashboard.pdf</UIAttachmentTitle>
      <UIAttachmentDescription>PDF · 2.4 MB</UIAttachmentDescription>
    </UIAttachmentContent>
    <UIAttachmentActions>
      <UIAttachmentAction aria-label="Remove sales-dashboard.pdf">
        <XIcon />
      </UIAttachmentAction>
    </UIAttachmentActions>
  </UIAttachment>
</template>
```

## Meaningful Information

- Order inside `Attachment`: `AttachmentMedia`, then `AttachmentContent`, then `AttachmentActions`, then `AttachmentTrigger`. The trigger must come last because it overlays the card.
- `AttachmentContent` holds `AttachmentTitle` then `AttachmentDescription` in that order.
- `AttachmentGroup` wraps multiple `Attachment` elements and renders a horizontally scrollable, snap-aligned row with an edge fade. Nesting is `AttachmentGroup` then `Attachment` children.
- `Attachment` props: `state` (`"idle" | "uploading" | "processing" | "error" | "done"`, default `"done"`), `size` (`"default" | "sm" | "xs"`, default `"default"`), `orientation` (`"horizontal" | "vertical"`, default `"horizontal"`), `class`.
- `AttachmentMedia` prop: `variant` (`"icon" | "image"`, default `"icon"`). Use `"image"` with an `<img>` child so the media clips as a square object-cover preview.
- `AttachmentAction` props: `variant` (a Button variant, default `"ghost"`), `size` (a Button size, default `"icon-xs"`), plus Button fallthrough attributes. It renders a `Button`.
- `AttachmentTrigger` props: `as` (default `"button"`), `as-child` (default `false`), plus fallthrough attributes. It renders a `Primitive`, so `as-child` forwards to a link or a dialog trigger element.
- `AttachmentContent`, `AttachmentTitle`, `AttachmentDescription`, `AttachmentActions`, and `AttachmentGroup` accept only `class`.
- `uploading` and `processing` apply a shimmer to `AttachmentTitle`. `error` switches borders and media to a destructive treatment and colors `AttachmentDescription` destructively. `idle` renders a dashed border.
- Vertical orientation stacks media above content and absolutely positions `AttachmentActions` in the top-right corner.
- Every action needs an `aria-label` describing the action and its target, since actions are usually icon-only.
- Every trigger needs an `aria-label` for what activating it does, since the trigger has no visible text.
- The trigger sits at a lower z-index than the actions, so actions stay clickable and both remain separately focusable.
- For a presentational group row, add `tabindex="0"`, `role="group"`, and an `aria-label` to `AttachmentGroup` so keyboard users can scroll it. Interactive groups need no extra work since users tab to the off-screen attachments.
- Keep the failure reason in `AttachmentDescription` so the `error` state is not conveyed by color alone.
- Lowercase exports `attachmentVariants` and `attachmentMediaVariants` and the types `AttachmentVariants` and `AttachmentMediaVariants` come from the index file.

## Examples

<!-- Single file with icon media and a remove action -->
```vue
<template>
  <UIAttachment>
    <UIAttachmentMedia>
      <FileTextIcon />
    </UIAttachmentMedia>
    <UIAttachmentContent>
      <UIAttachmentTitle>sales-dashboard.pdf</UIAttachmentTitle>
      <UIAttachmentDescription>PDF · 2.4 MB</UIAttachmentDescription>
    </UIAttachmentContent>
    <UIAttachmentActions>
      <UIAttachmentAction aria-label="Remove sales-dashboard.pdf">
        <XIcon />
      </UIAttachmentAction>
    </UIAttachmentActions>
  </UIAttachment>
</template>
```

<!-- Image preview, stacked vertically, inside a scrollable group -->
```vue
<script setup lang="ts">
const images = [
  { name: 'workspace.png', meta: 'PNG · 820 KB', src: '/workspace.png' },
]
</script>

<template>
  <UIAttachmentGroup class="w-full">
    <UIAttachment v-for="image in images" :key="image.name" orientation="vertical">
      <UIAttachmentMedia variant="image">
        <img :src="image.src" :alt="image.name">
      </UIAttachmentMedia>
      <UIAttachmentContent>
        <UIAttachmentTitle>{{ image.name }}</UIAttachmentTitle>
        <UIAttachmentDescription>{{ image.meta }}</UIAttachmentDescription>
      </UIAttachmentContent>
    </UIAttachment>
  </UIAttachmentGroup>
</template>
```

<!-- Upload lifecycle states -->
```vue
<template>
  <UIAttachment state="uploading" class="w-full">
    <UIAttachmentMedia>
      <UISpinner />
    </UIAttachmentMedia>
    <UIAttachmentContent>
      <UIAttachmentTitle>design-system.zip</UIAttachmentTitle>
      <UIAttachmentDescription>Uploading · 64%</UIAttachmentDescription>
    </UIAttachmentContent>
    <UIAttachmentActions>
      <UIAttachmentAction aria-label="Cancel upload">
        <XIcon />
      </UIAttachmentAction>
    </UIAttachmentActions>
  </UIAttachment>
</template>
```

<!-- Sizes -->
```vue
<template>
  <UIAttachment size="xs" class="w-full">
    <UIAttachmentMedia>
      <FileTextIcon />
    </UIAttachmentMedia>
    <UIAttachmentContent>
      <UIAttachmentTitle>Extra small attachment</UIAttachmentTitle>
    </UIAttachmentContent>
  </UIAttachment>
</template>
```

<!-- Trigger as an external link that keeps actions clickable -->
```vue
<template>
  <UIAttachment class="w-full">
    <UIAttachmentMedia variant="image">
      <img :src="src" alt="workspace.png">
    </UIAttachmentMedia>
    <UIAttachmentContent>
      <UIAttachmentTitle>workspace.png</UIAttachmentTitle>
      <UIAttachmentDescription>PNG · 820 KB</UIAttachmentDescription>
    </UIAttachmentContent>
    <UIAttachmentActions>
      <UIAttachmentAction aria-label="Remove workspace.png">
        <XIcon />
      </UIAttachmentAction>
    </UIAttachmentActions>
    <UIAttachmentTrigger as-child>
      <a :href="src" target="_blank" rel="noreferrer" aria-label="Open workspace.png" />
    </UIAttachmentTrigger>
  </UIAttachment>
</template>
```

<!-- Trigger that opens a dialog -->
```vue
<template>
  <UIDialog>
    <UIAttachment class="w-full">
      <UIAttachmentMedia>
        <FileSearchIcon />
      </UIAttachmentMedia>
      <UIAttachmentContent>
        <UIAttachmentTitle>research-summary.pdf</UIAttachmentTitle>
        <UIAttachmentDescription>Open preview dialog</UIAttachmentDescription>
      </UIAttachmentContent>
      <UIAttachmentActions>
        <UIAttachmentAction aria-label="Remove research-summary.pdf">
          <XIcon />
        </UIAttachmentAction>
      </UIAttachmentActions>
      <UIDialogTrigger as-child>
        <UIAttachmentTrigger aria-label="Preview research-summary.pdf" />
      </UIDialogTrigger>
    </UIAttachment>
    <UIDialogContent>
      <UIDialogHeader>
        <UIDialogTitle>research-summary.pdf</UIDialogTitle>
      </UIDialogHeader>
    </UIDialogContent>
  </UIDialog>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/attachment)
- [Button](../button/AGENTS.md)
