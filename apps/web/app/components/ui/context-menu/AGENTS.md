# Context Menu

A menu that opens where the pointer right-clicks; reach for it when an element needs a set of actions bound to a click target rather than a persistent button.

## Conclusion

`UIContextMenu` is a reka-ui `ContextMenuRoot` and provides the open state and focus context. The menu opens on right-click or long-press, so `UIContextMenuTrigger` wraps the element the user right-clicks and `UIContextMenuContent` holds the items. A reka-ui `ContextMenuPortal` is already inside `UIContextMenuContent`, so items escape overflow and stacking contexts with no extra wrapper. The one gotcha is that `UIContextMenuContent` reads the pointer position supplied by the trigger, so dropping `UIContextMenuTrigger` leaves the menu with no anchor; checkbox and radio items also render their own tick via `ContextMenuItemIndicator`, which requires sitting inside `UIContextMenuCheckboxItem` or `UIContextMenuRadioGroup` plus `UIContextMenuRadioItem`.

## Usage

```vue
<template>
  <UIContextMenu>
    <UIContextMenuTrigger
      class="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm"
    >
      Right click here
    </UIContextMenuTrigger>
    <UIContextMenuContent>
      <UIContextMenuItem>Profile</UIContextMenuItem>
      <UIContextMenuItem>Billing</UIContextMenuItem>
      <UIContextMenuItem>Team</UIContextMenuItem>
      <UIContextMenuSeparator />
      <UIContextMenuItem>Subscription</UIContextMenuItem>
    </UIContextMenuContent>
  </UIContextMenu>
</template>
```

## Meaningful Information

- `index.ts` exports `ContextMenu`, `ContextMenuCheckboxItem`, `ContextMenuContent`, `ContextMenuGroup`, `ContextMenuItem`, `ContextMenuLabel`, `ContextMenuRadioGroup`, `ContextMenuRadioItem`, `ContextMenuSeparator`, `ContextMenuShortcut`, `ContextMenuSub`, `ContextMenuSubContent`, `ContextMenuSubTrigger`, `ContextMenuTrigger`. Every export is a PascalCase component, so no explicit import is needed for these.
- `ContextMenuPortal.vue` exists in the folder but is not exported from `index.ts`; import it as `import { ContextMenuPortal } from '@/components/ui/context-menu'` only if you need to bypass the portal built into `UIContextMenuContent`.
- Required nesting: `UIContextMenu` wraps everything, `UIContextMenuTrigger` wraps the right-click target, and `UIContextMenuContent` holds items. `UIContextMenuItem` returns a `select` event; call `event.preventDefault()` inside it to keep the menu open after the click.
- Submenus need all three parts: `UIContextMenuSub` wraps `UIContextMenuSubTrigger` and `UIContextMenuSubContent`. `UIContextMenuSubContent` already contains a `ContextMenuPortal`, so it renders outside the parent content without an extra wrapper.
- Checkbox and radio items ship their own `ContextMenuItemIndicator` and a default `Tick02Icon`, placed absolutely at the top right. Override the tick with the `indicator-icon` slot. `UIContextMenuCheckboxItem` binds its checked state with `v-model` (`false | true | "indeterminate"`), and `UIContextMenuRadioGroup` binds the selected value with `v-model`.
- Required nesting for choice items: `UIContextMenuCheckboxItem` stands alone inside content, while `UIContextMenuRadioItem` requires a `value` and must sit inside `UIContextMenuRadioGroup` so exactly one stays selected.
- `UIContextMenuItem` adds wrapper props `inset` (boolean) and `variant` (`"default" | "destructive"`, default `"default"`). `UIContextMenuLabel` and `UIContextMenuSubTrigger` also add `inset`. All three apply it as `data-inset`, which the wrapper CSS reads for the extra left padding.
- `UIContextMenuShortcut` is a presentational `span` pinned right with `ml-auto`; it takes only `class` and performs no key handling. Pair it with real key handling elsewhere when the shortcut must work.
- `UIContextMenuGroup` groups related items and `UIContextMenuLabel` labels a section; the label is not focusable by arrow keys. `UIContextMenuSeparator` draws a one-pixel divider.
- `UIContextMenu` forwards `ContextMenuRootProps` and `ContextMenuRootEmits`: `dir` (`"ltr" | "rtl"`), `modal` (default `true`), `pressOpenDelay` (default `700`), and the `update:open` event. Bind visibility with `v-model:open`. With `modal: true`, outside interaction is disabled and only the menu is visible to screen readers.
- `UIContextMenuTrigger` forwards `ContextMenuTriggerProps`: `disabled` blocks the menu and restores the native browser menu, while `as` and `asChild` change the rendered element.
- `UIContextMenuContent` forwards `ContextMenuContentProps` and `ContextMenuContentEmits`: positioning props such as `alignOffset`, `avoidCollisions`, `collisionPadding`, `sideFlip`, `sticky`, and `loop`, plus the `closeAutoFocus`, `escapeKeyDown`, `focusOutside`, `interactOutside`, and `pointerDownOutside` events.
- `UIContextMenuSub` forwards `ContextMenuSubProps` and `ContextMenuSubEmits`: `defaultOpen` and `open` (`v-model:open`) with the `update:open` event, and an `open` slot exposing the current boolean.
- Content width and height come from the reka-ui custom properties `--reka-context-menu-trigger-width` and `--reka-context-menu-content-available-height`, and animation origin from `--reka-context-menu-content-transform-origin`; the wrapper classes already consume the last one for zoom-in.
- Accessibility follows the [Menu WAI-ARIA pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu) with roving tabindex. Arrow keys move between items, `Enter` or `Space` selects, `ArrowRight` opens a submenu, `ArrowLeft` closes it, `Escape` closes the menu, and typing jumps to a matching item using each item's text or its `textValue` prop.
- Styling hooks are the `data-slot` values `context-menu`, `context-menu-trigger`, `context-menu-content`, `context-menu-portal`, `context-menu-group`, `context-menu-item`, `context-menu-label`, `context-menu-separator`, `context-menu-shortcut`, `context-menu-checkbox-item`, `context-menu-radio-group`, `context-menu-radio-item`, `context-menu-sub`, `context-menu-sub-trigger`, and `context-menu-sub-content`. Driven states key off `data-open`, `data-disabled`, `data-inset`, `data-variant`, `data-side`, and `data-align`.

## Examples

```vue
<!-- Full menu: submenu, checkbox item, radio group, shortcuts, destructive item -->
<template>
  <UIContextMenu>
    <UIContextMenuTrigger
      class="flex h-[150px] w-[300px] items-center justify-center rounded-md border border-dashed text-sm"
    >
      Right click here
    </UIContextMenuTrigger>
    <UIContextMenuContent class="w-52">
      <UIContextMenuItem inset>
        Back
        <UIContextMenuShortcut>⌘[</UIContextMenuShortcut>
      </UIContextMenuItem>
      <UIContextMenuItem inset disabled>
        Forward
        <UIContextMenuShortcut>⌘]</UIContextMenuShortcut>
      </UIContextMenuItem>
      <UIContextMenuItem inset>
        Reload
        <UIContextMenuShortcut>⌘R</UIContextMenuShortcut>
      </UIContextMenuItem>
      <UIContextMenuSub>
        <UIContextMenuSubTrigger inset> More Tools </UIContextMenuSubTrigger>
        <UIContextMenuSubContent class="w-44">
          <UIContextMenuItem inset>
            Save Page...
            <UIContextMenuShortcut>⇧⌘S</UIContextMenuShortcut>
          </UIContextMenuItem>
          <UIContextMenuSeparator />
          <UIContextMenuItem variant="destructive"> Delete </UIContextMenuItem>
        </UIContextMenuSubContent>
      </UIContextMenuSub>
      <UIContextMenuSeparator />
      <UIContextMenuCheckboxItem :model-value="true">
        Show Bookmarks
        <UIContextMenuShortcut>⌘⇧B</UIContextMenuShortcut>
      </UIContextMenuCheckboxItem>
      <UIContextMenuSeparator />
      <UIContextMenuRadioGroup model-value="pedro">
        <UIContextMenuLabel inset> People </UIContextMenuLabel>
        <UIContextMenuRadioItem value="pedro"> Pedro Duarte </UIContextMenuRadioItem>
        <UIContextMenuRadioItem value="colm"> Colm Tuite </UIContextMenuRadioItem>
      </UIContextMenuRadioGroup>
    </UIContextMenuContent>
  </UIContextMenu>
</template>
```

```vue
<!-- Controlled open state, reacting to the open event -->
<template>
  <UIContextMenu v-model:open="open">
    <UIContextMenuTrigger class="rounded-md border border-dashed p-6 text-sm">
      Right click here
    </UIContextMenuTrigger>
    <UIContextMenuContent>
      <UIContextMenuItem @select="onSelect">Duplicate</UIContextMenuItem>
    </UIContextMenuContent>
  </UIContextMenu>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)

function onSelect() {
  open.value = false
}
</script>
```

```vue
<!-- Trigger disabled, so right-click falls back to the native browser menu -->
<template>
  <UIContextMenu>
    <UIContextMenuTrigger disabled class="rounded-md border border-dashed p-6 text-sm">
      Right click disabled here
    </UIContextMenuTrigger>
    <UIContextMenuContent>
      <UIContextMenuItem>Profile</UIContextMenuItem>
    </UIContextMenuContent>
  </UIContextMenu>
</template>
```

## References

- [Context Menu (this component)](./AGENTS.md)
- [shadcn-vue Context Menu](https://shadcn-vue.com/docs/components/context-menu)
- [reka-ui Context Menu](https://reka-ui.com/docs/components/context-menu)
