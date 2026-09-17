# Menubar

A persistent horizontal menu for desktop-style commands, with keyboard navigation, nested submenus, and selectable menu items.

## Conclusion

`UIMenubar` provides the root focus and open-menu context. Each `UIMenubarMenu` pairs one `UIMenubarTrigger` with one `UIMenubarContent`. Put the trigger and content in that order. `UIMenubarContent` and `UIMenubarSubContent` already portal their content, so a consumer does not add a portal wrapper. The main gotchas are that controlled root menus need unique menu values, radio items need a radio group and a value, and `UIMenubarShortcut` displays text without binding a key.

## Usage

Use the `UI` prefix for every exported component. Nuxt auto-imports these names from `@/components/ui` through the `shadcn-nuxt` configuration. Use the same prefix for any other local UI component. Do not import a `Menubar` component in a consumer. Import lowercase helpers such as `ref` and type-only exports explicitly when an example needs them.

```vue
<template>
  <UIMenubar>
    <UIMenubarMenu value="file">
      <UIMenubarTrigger>File</UIMenubarTrigger>
      <UIMenubarContent>
        <UIMenubarItem>New window</UIMenubarItem>
        <UIMenubarSeparator />
        <UIMenubarItem>Close</UIMenubarItem>
      </UIMenubarContent>
    </UIMenubarMenu>
  </UIMenubar>
</template>
```

## Meaningful Information

- `index.ts` exports exactly `Menubar`, `MenubarCheckboxItem`, `MenubarContent`, `MenubarGroup`, `MenubarItem`, `MenubarLabel`, `MenubarMenu`, `MenubarRadioGroup`, `MenubarRadioItem`, `MenubarSeparator`, `MenubarShortcut`, `MenubarSub`, `MenubarSubContent`, `MenubarSubTrigger`, and `MenubarTrigger`. The corresponding auto-imported tags use the `UI` prefix.
- `UIMenubar` wraps the complete menubar. `UIMenubarMenu` is a top-level menu. `UIMenubarTrigger` is its button. `UIMenubarContent` contains the items that open from that trigger.
- Give each controlled `UIMenubarMenu` a unique `value`. The root `v-model` contains the value of the open top-level menu. An uncontrolled root can use `default-value`. The root also accepts `dir="ltr"` or `dir="rtl"` and `loop` for wrapped keyboard movement.
- `UIMenubarMenu` must contain its `UIMenubarTrigger` and `UIMenubarContent`. A content panel without its matching trigger has no usable anchor.
- `UIMenubarContent` accepts Reka UI positioning and collision props. The local wrapper defaults to `align="start"`, `align-offset="-4"`, and `side-offset="8"`. Pass `side`, `align`, `side-offset`, `align-offset`, `collision-padding`, or `avoid-collisions` when the default placement is wrong.
- `UIMenubarGroup` groups related items. `UIMenubarLabel` names a section and is skipped by arrow-key focus. `UIMenubarSeparator` draws a visual divider. None of these parts is required.
- `UIMenubarItem` is a selectable command. It supports the forwarded Reka UI props, including `disabled` and `text-value`, and emits `select`. Call `event.preventDefault()` in the `select` handler when the menu must stay open. The local wrapper adds `inset` for extra left padding and `variant="destructive"` for destructive styling.
- `UIMenubarShortcut` is a presentational `span` aligned to the right of its parent item. It accepts `class` and slot content. It does not register or handle the displayed shortcut.
- `UIMenubarCheckboxItem` is an independent checkable item. Bind `v-model` to `boolean` or the Reka UI tri-state value `"indeterminate"`. It emits `update:modelValue` and `select`. The wrapper renders a default `Tick02Icon`. Use its `indicator-icon` slot to replace that icon.
- `UIMenubarRadioGroup` owns one selected value. Bind it with `v-model` and listen for `update:modelValue` when needed. Place `UIMenubarRadioItem` children inside it. Every radio item requires a unique `value`, and it emits `select`.
- `UIMenubarLabel` and `UIMenubarSubTrigger` accept the local `inset` prop. `UIMenubarRadioItem` and `UIMenubarCheckboxItem` do not add that prop in this folder.
- `UIMenubarSub` wraps one submenu. Its `UIMenubarSubTrigger` opens the submenu, and its `UIMenubarSubContent` contains the nested items. `UIMenubarSub` supports `default-open`, `v-model:open`, `open`, and `update:open`. Its `open` slot exposes the current boolean state.
- `UIMenubarSubTrigger` must be inside `UIMenubarSub`. The local wrapper appends a right-arrow icon and accepts `disabled`, `text-value`, `as`, `as-child`, `class`, and `inset`.
- `UIMenubarSubContent` accepts the forwarded floating-position props and outside-focus events. It portals internally and must remain inside the matching `UIMenubarSub` tree. Do not add `MenubarPortal` because this folder does not export it.
- The local folder does not export `MenubarPortal`, `MenubarArrow`, or `MenubarItemIndicator`. Checkbox and radio wrappers use an internal item indicator and expose only the `indicator-icon` slot for customization.
- Root state emits `update:modelValue`. Content and submenu content forward focus and dismissal events such as `closeAutoFocus`, `escapeKeyDown`, `focusOutside`, `interactOutside`, and `pointerDownOutside`. Submenus emit `update:open`. In templates, use kebab-case listeners such as `@update:model-value`, `@update:open`, `@select`, and `@escape-key-down`.
- `UIMenubar` follows the Menu Button WAI-ARIA pattern and uses roving tabindex. Keep visible text on triggers and items. Keep disabled commands marked with `disabled` instead of removing them from the menu when users need to understand why a command is unavailable.
- `Enter` opens a trigger menu or activates a focused item. `Space` opens a trigger menu and focuses its first item, or activates a focused item. `ArrowDown` opens the associated trigger menu or moves to the next item. `ArrowUp` moves to the previous item. `ArrowRight` and `ArrowLeft` move between top-level menus and open or close submenus according to the reading direction. `Escape` closes the active menu and returns focus to its trigger. Typeahead moves focus to an item matching its text or its `text-value`.
- Styling hooks include the `data-slot` values `menubar`, `menubar-menu`, `menubar-trigger`, `menubar-content`, `menubar-group`, `menubar-item`, `menubar-label`, `menubar-separator`, `menubar-shortcut`, `menubar-checkbox-item`, `menubar-radio-group`, `menubar-radio-item`, `menubar-sub`, `menubar-sub-trigger`, and `menubar-sub-content`. The local styles also use `data-inset`, `data-variant`, and open, disabled, side, and align state attributes.

## Examples

This composition covers groups, labels, separators, shortcuts, a disabled item, a destructive item, and a submenu.

```vue
<template>
  <UIMenubar>
    <UIMenubarMenu value="file">
      <UIMenubarTrigger>File</UIMenubarTrigger>
      <UIMenubarContent class="w-56">
        <UIMenubarLabel inset>Document</UIMenubarLabel>
        <UIMenubarGroup>
          <UIMenubarItem inset>
            New window
            <UIMenubarShortcut>⌘N</UIMenubarShortcut>
          </UIMenubarItem>
          <UIMenubarItem inset disabled> New private window </UIMenubarItem>
        </UIMenubarGroup>
        <UIMenubarSeparator />
        <UIMenubarSub>
          <UIMenubarSubTrigger inset>Share</UIMenubarSubTrigger>
          <UIMenubarSubContent class="w-44">
            <UIMenubarItem>Email link</UIMenubarItem>
            <UIMenubarItem>Copy link</UIMenubarItem>
          </UIMenubarSubContent>
        </UIMenubarSub>
        <UIMenubarSeparator />
        <UIMenubarItem variant="destructive">Delete</UIMenubarItem>
      </UIMenubarContent>
    </UIMenubarMenu>
  </UIMenubar>
</template>
```

Bind independent checkboxes and one radio selection inside the same content panel.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const showBookmarks = ref(true)
const profile = ref('benoit')
</script>

<template>
  <UIMenubar>
    <UIMenubarMenu value="view">
      <UIMenubarTrigger>View</UIMenubarTrigger>
      <UIMenubarContent>
        <UIMenubarCheckboxItem v-model="showBookmarks"> Show bookmarks </UIMenubarCheckboxItem>
        <UIMenubarSeparator />
        <UIMenubarRadioGroup v-model="profile">
          <UIMenubarLabel>Profile</UIMenubarLabel>
          <UIMenubarRadioItem value="andy">Andy</UIMenubarRadioItem>
          <UIMenubarRadioItem value="benoit">Benoit</UIMenubarRadioItem>
        </UIMenubarRadioGroup>
      </UIMenubarContent>
    </UIMenubarMenu>
  </UIMenubar>
</template>
```

Control the active menu and submenu, and keep one item open after selection.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const activeMenu = ref('file')
const shareOpen = ref(false)

function keepMenuOpen(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <UIMenubar v-model="activeMenu" loop>
    <UIMenubarMenu value="file">
      <UIMenubarTrigger>File</UIMenubarTrigger>
      <UIMenubarContent @escape-key-down="activeMenu = ''">
        <UIMenubarItem @select="keepMenuOpen">Keep this menu open</UIMenubarItem>
        <UIMenubarSub v-model:open="shareOpen">
          <UIMenubarSubTrigger>Share</UIMenubarSubTrigger>
          <UIMenubarSubContent>
            <UIMenubarItem>Copy link</UIMenubarItem>
          </UIMenubarSubContent>
        </UIMenubarSub>
      </UIMenubarContent>
    </UIMenubarMenu>
  </UIMenubar>
</template>
```

## References

- [shadcn-vue Menubar](https://shadcn-vue.com/docs/components/menubar)
- [Reka UI Menubar](https://reka-ui.com/docs/components/menubar)
- [Menu Button WAI-ARIA pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubutton)
- [Roving tabindex](https://www.w3.org/WAI/ARIA/apg/patterns/kbd_roving_tabindex)
