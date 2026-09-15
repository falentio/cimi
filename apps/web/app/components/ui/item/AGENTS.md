# Item

Provides a composable flex container for titles, descriptions, media, and actions in list-like layouts.

## Conclusion

Use `UIItem` for one content row and `UIItemGroup` for related rows. Compose media, content, and actions as direct children, then use `as-child` when the whole item needs to be a link. The main local gotcha is that `size="xs"` is supported by the source even though the official `Item` prop table lists only `default` and `sm`.

## Usage

```vue
<template>
  <UIItem variant="outline">
    <UIItemContent>
      <UIItemTitle>Basic item</UIItemTitle>
      <UIItemDescription>A simple item with title and description.</UIItemDescription>
    </UIItemContent>
    <UIItemActions>
      <UIButton variant="outline" size="sm">Action</UIButton>
    </UIItemActions>
  </UIItem>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports the PascalCase component exports with the `UI` prefix. Use the `UI` tags in templates without component imports.
- The component exports are `Item`, `ItemActions`, `ItemContent`, `ItemDescription`, `ItemFooter`, `ItemGroup`, `ItemHeader`, `ItemMedia`, `ItemSeparator`, and `ItemTitle`.
- The non-component exports are `itemVariants`, `itemMediaVariants`, the `ItemVariants` type, and the `ItemMediaVariants` type. Import these explicitly from `@/components/ui/item` when a script uses them.
- `UIItem` accepts `variant`, `size`, `as`, `asChild`, and `class`. It renders a `div` by default, and `asChild` defaults to `false`.
- `UIItem` `variant` values are `default`, `outline`, and `muted`. The default is `default`. `default` uses a transparent border, `outline` uses the border color, and `muted` adds a muted background.
- `UIItem` `size` values are `default`, `sm`, and `xs`. The default is `default`. `default` and `sm` currently share the root spacing, while `xs` uses tighter spacing.
- `as` changes the element rendered by `UIItem`. Use `as="section"` or another suitable element when the item itself needs a different element.
- `asChild` renders the single child element as the item root. Use the template spelling `as-child`. Pass exactly one child element, such as an `<a>` or a router link.
- `UIItemMedia` accepts `variant` and `class`. Its `variant` values are `default`, `icon`, and `image`. The effective default is `default`.
- The `default` media variant provides a transparent media wrapper for arbitrary content such as an avatar. The `icon` variant gives SVG icons a default `size-4` size unless the icon already has a `size-*` class. The `image` variant sizes the wrapper to `size-10`, `size-8` for `sm` items, or `size-6` for `xs` items, then makes nested images fill the wrapper with `object-cover`.
- `UIItemContent`, `UIItemTitle`, `UIItemDescription`, `UIItemActions`, `UIItemHeader`, `UIItemFooter`, and `UIItemGroup` accept `class`.
- `UIItemContent` wraps a title and description and grows to fill the available row. Skip it when the item only needs a title. A second `UIItemContent` can hold fixed secondary content, such as a duration.
- `UIItemTitle` renders a styled `div` with one line of text by default. It is not a semantic heading.
- `UIItemDescription` renders a styled `p` with up to two lines by default. Anchors inside it receive underline and hover styles.
- `UIItemActions` renders a flex wrapper for buttons or other actions. Keep action controls inside this wrapper.
- `UIItemHeader` and `UIItemFooter` render full-width flex rows. Put them directly inside `UIItem` when they need to span the item.
- `UIItemGroup` renders a `div` with `role="list"` and groups related items with responsive gaps. It has no `asChild` prop.
- `UIItemSeparator` wraps the local Separator component and always renders a horizontal separator with `my-2`. Pass `class` to adjust its spacing or appearance. Its local type also intersects `SeparatorProps`, but the wrapper only binds `class`, `data-slot`, and the horizontal orientation.
- Every component except `UIItemSeparator` exposes one default slot. There are no named slots. `UIItemSeparator` has no slot and does not accept children.
- The components declare no `v-model` bindings and no custom emitted events. Use native listeners such as `@click` on the rendered item or an action control. `as-child` passes the item behavior and attributes to the child root.
- Use `as-child` with an anchor for navigation. The item hover and focus styles then apply to the anchor. Add `target="_blank"` and `rel="noopener noreferrer"` for an external link that opens a new tab.
- Do not put a button or another link inside an item that renders as an anchor. Move the action outside the link or make the trailing content decorative.
- `UIItemGroup` supplies the list role, but `UIItem` does not supply `role="listitem"`. Add `role="listitem"` to each item when the group is used as a semantic list. Separators are direct children in the documented group pattern.
- Give every meaningful image an `alt` value. Mark decorative media and icons with `aria-hidden="true"`.
- Add an accessible name with `aria-label` to an icon-only button in `UIItemActions`. Use visible text when the action can have a label.
- `UIItemTitle` is a `div`, so add a real heading elsewhere when the item title must appear in the document heading outline.
- `UIItem` uses `flex-wrap`, and the header and footer use full-basis rows. Keep the usual direct-child order as media, content, and actions for a single row, with header or footer as separate full-width rows.

## Examples

Use the three item variants for different visual emphasis levels.

```vue
<template>
  <div class="flex flex-col gap-4">
    <UIItem>
      <UIItemContent>
        <UIItemTitle>Default item</UIItemTitle>
      </UIItemContent>
    </UIItem>
    <UIItem variant="outline">
      <UIItemContent>
        <UIItemTitle>Outline item</UIItemTitle>
      </UIItemContent>
    </UIItem>
    <UIItem variant="muted" size="xs">
      <UIItemContent>
        <UIItemTitle>Compact muted item</UIItemTitle>
      </UIItemContent>
    </UIItem>
  </div>
</template>
```

Use `UIItemMedia` for an icon, an image, or other media.

```vue
<script setup lang="ts">
import { ShieldAlertIcon } from '@lucide/vue'
</script>

<template>
  <div class="flex flex-col gap-4">
    <UIItem variant="outline">
      <UIItemMedia variant="icon" aria-hidden="true">
        <ShieldAlertIcon />
      </UIItemMedia>
      <UIItemContent>
        <UIItemTitle>Security alert</UIItemTitle>
        <UIItemDescription>Review the new login.</UIItemDescription>
      </UIItemContent>
    </UIItem>
    <UIItem variant="outline" size="sm">
      <UIItemMedia variant="image">
        <img src="https://avatar.vercel.sh/Example" alt="Example" width="32" height="32" />
      </UIItemMedia>
      <UIItemContent>
        <UIItemTitle>Example image</UIItemTitle>
      </UIItemContent>
    </UIItem>
  </div>
</template>
```

Render the whole item as a link with `as-child`.

```vue
<template>
  <UIItem variant="outline" as-child role="listitem">
    <a href="/dashboard">
      <UIItemContent>
        <UIItemTitle>Dashboard</UIItemTitle>
        <UIItemDescription>View account activity.</UIItemDescription>
      </UIItemContent>
      <UIItemActions aria-hidden="true">
        <span>→</span>
      </UIItemActions>
    </a>
  </UIItem>
</template>
```

Group related items and place separators between them.

```vue
<template>
  <UIItemGroup>
    <UIItem role="listitem">
      <UIItemContent>
        <UIItemTitle>shadcn</UIItemTitle>
        <UIItemDescription>shadcn@vercel.com</UIItemDescription>
      </UIItemContent>
      <UIItemActions>
        <UIButton variant="ghost" size="sm">Invite</UIButton>
      </UIItemActions>
    </UIItem>
    <UIItemSeparator />
    <UIItem role="listitem">
      <UIItemContent>
        <UIItemTitle>maxleiter</UIItemTitle>
        <UIItemDescription>maxleiter@vercel.com</UIItemDescription>
      </UIItemContent>
      <UIItemActions>
        <UIButton variant="ghost" size="sm">Invite</UIButton>
      </UIItemActions>
    </UIItem>
  </UIItemGroup>
</template>
```

Use full-width header and footer rows when the item needs surrounding metadata or controls.

```vue
<template>
  <UIItem variant="outline">
    <UIItemHeader>Account</UIItemHeader>
    <UIItemContent>
      <UIItemTitle>Team access</UIItemTitle>
      <UIItemDescription>Manage who can access this project.</UIItemDescription>
    </UIItemContent>
    <UIItemFooter>
      <span>3 members</span>
      <UIButton size="sm">Manage</UIButton>
    </UIItemFooter>
  </UIItem>
</template>
```

## References

- [Item documentation](https://shadcn-vue.com/docs/components/item)
- [Button](../button/AGENTS.md) for controls inside `UIItemActions`
- [Avatar](../avatar/AGENTS.md) for avatar media inside `UIItemMedia`
