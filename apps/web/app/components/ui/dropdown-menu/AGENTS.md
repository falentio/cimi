# Dropdown Menu

A menu of actions or functions that opens from a button trigger; reach for it when a control opens a list of choices rather than acting immediately.

## Conclusion

`UIDropdownMenu` is a reka-ui `DropdownMenuRoot` supplying the open state and focus context. Only `UIDropdownMenuTrigger` and `UIDropdownMenuContent` are mandatory below it; every other part nests inside content. A reka-ui `DropdownMenuPortal` already wraps `UIDropdownMenuContent`, so items escape overflow and stacking contexts with no extra wrapper, and `UIDropdownMenuSubContent` renders in place inside its parent content. The gotchas: `UIDropdownMenuTrigger` renders a bare `button`, so pass `as-child` and put `UIButton` inside to style it; `UIDropdownMenuCheckboxItem` stands alone while `UIDropdownMenuRadioItem` requires a `value` and a surrounding `UIDropdownMenuRadioGroup`; submenus need all three of `UIDropdownMenuSub`, `UIDropdownMenuSubTrigger`, and `UIDropdownMenuSubContent`.

## Usage

```vue
<template>
  <UIDropdownMenu>
    <UIDropdownMenuTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UIDropdownMenuTrigger>
    <UIDropdownMenuContent>
      <UIDropdownMenuLabel>My Account</UIDropdownMenuLabel>
      <UIDropdownMenuSeparator />
      <UIDropdownMenuItem>Profile</UIDropdownMenuItem>
      <UIDropdownMenuItem>Billing</UIDropdownMenuItem>
      <UIDropdownMenuItem>Team</UIDropdownMenuItem>
      <UIDropdownMenuItem>Subscription</UIDropdownMenuItem>
    </UIDropdownMenuContent>
  </UIDropdownMenu>
</template>
```

## Meaningful Information

- `index.ts` exports `DropdownMenu`, `DropdownMenuCheckboxItem`, `DropdownMenuContent`, `DropdownMenuGroup`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`, `DropdownMenuTrigger`, plus `DropdownMenuPortal` re-exported from `reka-ui`. Every export is a PascalCase component, so `shadcn-nuxt` auto-imports each as `UI` + name with no explicit import.
- `DropdownMenuPortal` is also pinned inside `DropdownMenuContent` and `DropdownMenuSubContent`. The wrapper export is only for a hand-rolled content tree; a normal menu never imports it.
- Required nesting: `UIDropdownMenu` wraps everything and `UIDropdownMenuTrigger` toggles content. Omit the trigger and nothing opens the menu.
- `UIDropdownMenuContent` positions against the trigger. Its defaults are `align: "start"` and `sideOffset: 4`; pass `align` (`"start" | "center" | "end"`) and `side` (`"top" | "right" | "bottom" | "left"`) to place it.
- `UIDropdownMenuGroup` clusters related items, `UIDropdownMenuLabel` titles a section and stays unfocusable by arrow keys, `UIDropdownMenuSeparator` draws a one-pixel divider. None of the three are required.
- `UIDropdownMenuItem` selects on click or `Enter`. Call `event.preventDefault()` inside its `select` event to keep the menu open. A disabled item renders `data-disabled` and drops keyboard focus.
- `UIDropdownMenuCheckboxItem` binds its checked state with `v-model` typed `false | true | "indeterminate"`. `UIDropdownMenuRadioGroup` binds the selected value with `v-model` and holds `UIDropdownMenuRadioItem` children, each needing a unique `value`.
- Both choice items ship their own indicator: a `DropdownMenuItemIndicator` plus a default `Tick02Icon`, absolutely positioned top right. Override the icon through the `indicator-icon` slot.
- Submenus use `UIDropdownMenuSub` wrapping `UIDropdownMenuSubTrigger` and `UIDropdownMenuSubContent` in that order. `UIDropdownMenuSub` accepts `open` (`v-model:open`), `defaultOpen`, an `update:open` event, and an `open` slot exposing the boolean.
- `inset` (boolean) is added by `DropdownMenuItem`, `DropdownMenuLabel`, and `DropdownMenuSubTrigger`; each applies it as `data-inset` for extra left padding. `DropdownMenuItem` also adds `variant` (`"default" | "destructive"`, default `"default"`), which maps to `data-variant` and switches the item to destructive colors.
- `DropdownMenuShortcut` is a presentational `span` pinned right with `ml-auto`; it takes only `class` and performs no key handling. Pair it with real key handling when the shortcut must work.
- `UIDropdownMenu` forwards `DropdownMenuRootProps` and `DropdownMenuRootEmits`: `open` (`v-model:open`), `defaultOpen`, `dir` (`"ltr" | "rtl"`), `modal` (default `true`), and `update:open`. `modal: true` disables outside interaction and exposes only content to screen readers; set `modal: false` when the page behind must stay interactive.
- `UIDropdownMenuTrigger` forwards `DropdownMenuTriggerProps`: `as`, `asChild`, and `disabled`, which blocks the menu.
- `UIDropdownMenuContent` forwards `DropdownMenuContentProps` and `DropdownMenuContentEmits`: positioning props such as `alignOffset`, `avoidCollisions`, `collisionPadding`, `loop`, `sideFlip`, and `sticky`, plus the `closeAutoFocus`, `escapeKeyDown`, `focusOutside`, `interactOutside`, and `pointerDownOutside` events.
- Content width and max height come from the reka-ui custom properties `--reka-dropdown-menu-trigger-width` and `--reka-dropdown-menu-content-available-height`, and the zoom-in origin from `--reka-dropdown-menu-content-transform-origin`; the wrapper classes already consume the last two.
- Accessibility follows the [Menu Button WAI-ARIA pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button) with roving tabindex. Arrow keys move between items, `Enter` or `Space` selects, `ArrowRight` opens a submenu, `ArrowLeft` closes it, `Escape` closes the menu, and typing jumps to the item matching each item's text or its `textValue`.
- Styling hooks are the `data-slot` values `dropdown-menu`, `dropdown-menu-trigger`, `dropdown-menu-content`, `dropdown-menu-group`, `dropdown-menu-item`, `dropdown-menu-label`, `dropdown-menu-separator`, `dropdown-menu-shortcut`, `dropdown-menu-checkbox-item`, `dropdown-menu-checkbox-item-indicator`, `dropdown-menu-radio-group`, `dropdown-menu-radio-item`, `dropdown-menu-radio-item-indicator`, `dropdown-menu-sub`, `dropdown-menu-sub-trigger`, and `dropdown-menu-sub-content`. Driven states key off `data-open`, `data-closed`, `data-disabled`, `data-inset`, `data-variant`, `data-side`, and `data-align`.

## Examples

```vue
<!-- Basic menu: trigger styled via as-child, grouped items with shortcuts and a destructive action -->
<template>
  <UIDropdownMenu>
    <UIDropdownMenuTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UIDropdownMenuTrigger>
    <UIDropdownMenuContent class="w-56">
      <UIDropdownMenuLabel>My Account</UIDropdownMenuLabel>
      <UIDropdownMenuGroup>
        <UIDropdownMenuItem>
          Profile
          <UIDropdownMenuShortcut>⇧⌘P</UIDropdownMenuShortcut>
        </UIDropdownMenuItem>
        <UIDropdownMenuItem>
          Billing
          <UIDropdownMenuShortcut>⌘B</UIDropdownMenuShortcut>
        </UIDropdownMenuItem>
        <UIDropdownMenuItem variant="destructive">Log out</UIDropdownMenuItem>
      </UIDropdownMenuGroup>
    </UIDropdownMenuContent>
  </UIDropdownMenu>
</template>
```

```vue
<!-- Checkbox items: each binds an independent boolean -->
<template>
  <UIDropdownMenu>
    <UIDropdownMenuTrigger as-child>
      <UIButton variant="outline">View</UIButton>
    </UIDropdownMenuTrigger>
    <UIDropdownMenuContent class="w-56">
      <UIDropdownMenuCheckboxItem v-model="showStatusBar">Status Bar</UIDropdownMenuCheckboxItem>
      <UIDropdownMenuCheckboxItem v-model="showActivityBar">Activity Bar</UIDropdownMenuCheckboxItem>
      <UIDropdownMenuCheckboxItem v-model="showPanel">Panel</UIDropdownMenuCheckboxItem>
    </UIDropdownMenuContent>
  </UIDropdownMenu>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const showStatusBar = ref(true)
const showActivityBar = ref(false)
const showPanel = ref(false)
</script>
```

```vue
<!-- Radio items: one selection held by the group, each item carries a unique value -->
<template>
  <UIDropdownMenu>
    <UIDropdownMenuTrigger as-child>
      <UIButton variant="outline">Position</UIButton>
    </UIDropdownMenuTrigger>
    <UIDropdownMenuContent class="w-56">
      <UIDropdownMenuRadioGroup v-model="position">
        <UIDropdownMenuLabel inset>Panel Position</UIDropdownMenuLabel>
        <UIDropdownMenuSeparator />
        <UIDropdownMenuRadioItem value="top">Top</UIDropdownMenuRadioItem>
        <UIDropdownMenuRadioItem value="bottom">Bottom</UIDropdownMenuRadioItem>
        <UIDropdownMenuRadioItem value="right">Right</UIDropdownMenuRadioItem>
      </UIDropdownMenuRadioGroup>
    </UIDropdownMenuContent>
  </UIDropdownMenu>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const position = ref('bottom')
</script>
```

```vue
<!-- Submenu: Sub wraps SubTrigger and SubContent, separated from its parent items -->
<template>
  <UIDropdownMenu>
    <UIDropdownMenuTrigger as-child>
      <UIButton variant="outline">Team</UIButton>
    </UIDropdownMenuTrigger>
    <UIDropdownMenuContent class="w-56">
      <UIDropdownMenuItem>New Team</UIDropdownMenuItem>
      <UIDropdownMenuSeparator />
      <UIDropdownMenuSub>
        <UIDropdownMenuSubTrigger inset>Invite users</UIDropdownMenuSubTrigger>
        <UIDropdownMenuSubContent class="w-44">
          <UIDropdownMenuItem>Email</UIDropdownMenuItem>
          <UIDropdownMenuItem>Message</UIDropdownMenuItem>
          <UIDropdownMenuSeparator />
          <UIDropdownMenuItem>More...</UIDropdownMenuItem>
        </UIDropdownMenuSubContent>
      </UIDropdownMenuSub>
    </UIDropdownMenuContent>
  </UIDropdownMenu>
</template>
```

## References

- [Dropdown Menu (this component)](./AGENTS.md)
- [shadcn-vue Dropdown Menu](https://shadcn-vue.com/docs/components/dropdown-menu)
- [reka-ui Dropdown Menu](https://reka-ui.com/docs/components/dropdown-menu)
- [Button](../button/AGENTS.md)
- [Context Menu](../context-menu/AGENTS.md)
