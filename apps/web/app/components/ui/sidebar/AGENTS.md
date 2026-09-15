# Sidebar

A composable, responsive navigation layout that provides collapsible desktop navigation and Sheet-backed mobile navigation.

## Conclusion

Use `UISidebarProvider` as the required context root, then place `UISidebar` and `UISidebarInset` as siblings below it. `UISidebar` owns navigation content, while `UISidebarInset` renders the main region and applies the inset layout rules. The main gotchas are that `open` controls desktop state while mobile uses a separate `openMobile` state, the local provider has no `storageKey` prop, and every component that calls `useSidebar` must stay inside `UISidebarProvider`.

## Usage

Use this composition for an application shell:

```text
<UISidebarProvider>
  <UISidebar>...</UISidebar>
  <UISidebarInset>...</UISidebarInset>
</UISidebarProvider>
```

`UISidebarProvider` wraps the complete shell and provides state, keyboard handling, cookies, responsive detection, and tooltip context. `UISidebar` and `UISidebarInset` must be siblings so the inset styles can read the sidebar peer attributes. Use a native `main` element instead of `UISidebarInset` only when you do not need the inset layout behavior.

The `shadcn-nuxt` module auto-imports every component with the project prefix `UI`. Use these exact template tags without component imports:

`<UISidebar>`, `<UISidebarContent>`, `<UISidebarFooter>`, `<UISidebarGroup>`, `<UISidebarGroupAction>`, `<UISidebarGroupContent>`, `<UISidebarGroupLabel>`, `<UISidebarHeader>`, `<UISidebarInput>`, `<UISidebarInset>`, `<UISidebarMenu>`, `<UISidebarMenuAction>`, `<UISidebarMenuBadge>`, `<UISidebarMenuButton>`, `<UISidebarMenuItem>`, `<UISidebarMenuSkeleton>`, `<UISidebarMenuSub>`, `<UISidebarMenuSubButton>`, `<UISidebarMenuSubItem>`, `<UISidebarProvider>`, `<UISidebarRail>`, `<UISidebarSeparator>`, and `<UISidebarTrigger>`.

## Meaningful Information

- **Exports.** The barrel at `index.ts` exports 23 components. They are `Sidebar`, `SidebarContent`, `SidebarFooter`, `SidebarGroup`, `SidebarGroupAction`, `SidebarGroupContent`, `SidebarGroupLabel`, `SidebarHeader`, `SidebarInput`, `SidebarInset`, `SidebarMenu`, `SidebarMenuAction`, `SidebarMenuBadge`, `SidebarMenuButton`, `SidebarMenuItem`, `SidebarMenuSkeleton`, `SidebarMenuSub`, `SidebarMenuSubButton`, `SidebarMenuSubItem`, `SidebarProvider`, `SidebarRail`, `SidebarSeparator`, and `SidebarTrigger`.
- **Named exports.** The barrel also exports the `SidebarProps` interface, the `useSidebar` composable, the `sidebarMenuButtonVariants` CVA helper, and the `SidebarMenuButtonVariants` type. Import these names explicitly from `@/components/ui/sidebar`. Use a type-only import for `SidebarProps` and `SidebarMenuButtonVariants`.

  ```ts
  import { sidebarMenuButtonVariants, useSidebar } from '@/components/ui/sidebar'
  import type { SidebarMenuButtonVariants, SidebarProps } from '@/components/ui/sidebar'
  ```

- **Private implementation exports.** `SidebarMenuButtonChild.vue` declares `SidebarMenuButtonProps` and has a default component export, but `index.ts` does not re-export either name. Treat that file as an implementation detail and import the public `SidebarMenuButton` instead.
- **Utility exports.** `utils.ts` exports `SIDEBAR_COOKIE_NAME`, `SIDEBAR_COOKIE_MAX_AGE`, `SIDEBAR_WIDTH`, `SIDEBAR_WIDTH_MOBILE`, `SIDEBAR_WIDTH_ICON`, `SIDEBAR_KEYBOARD_SHORTCUT`, `useSidebar`, and `provideSidebarContext`. Only `useSidebar` is re-exported by the barrel. The other utility names are internal constants or provider plumbing.
- **Provider props.** `UISidebarProvider` accepts `default-open`, `open`, and `class`. It emits `update:open`. Leave `open` unset for local state, pass `default-open` for the initial desktop state, or bind `v-model:open` for controlled desktop state.
- **Provider defaults.** `default-open` is true unless the browser cookie contains `sidebar_state=false`. The provider writes `sidebar_state=true` or `sidebar_state=false` with `path=/` and a seven-day max age whenever desktop state changes.
- **Cookie gotcha.** The cookie name and lifetime are fixed by `SIDEBAR_COOKIE_NAME` and `SIDEBAR_COOKIE_MAX_AGE`. The local provider does not accept the upstream docs' `storage-key` prop. The cookie persists desktop state only. Mobile state resets when the provider is recreated.
- **Keyboard shortcut.** Press `Ctrl+B` or `Cmd+B` to call `toggleSidebar`. The handler prevents the browser's default action. The source compares `event.key` with lowercase `b`, so `Shift+B` is not the same shortcut.
- **Context.** `useSidebar` must run below `UISidebarProvider`. `Sidebar`, `SidebarMenuButton`, `SidebarRail`, and `SidebarTrigger` all consume the context.
- **Composable return value.** `useSidebar()` returns `state`, `open`, `setOpen`, `isMobile`, `openMobile`, `setOpenMobile`, and `toggleSidebar`. `state` is a computed value of `expanded` or `collapsed`. `open` and `openMobile` are refs. `setOpen` changes and persists desktop state. `setOpenMobile` changes the mobile Sheet state without writing the cookie. `toggleSidebar` chooses `setOpenMobile` on mobile and `setOpen` on desktop.
- **Responsive breakpoint.** `isMobile` uses `(max-width: 768px)`. At that width and below, `UISidebar` renders the project Sheet component with a width of `18rem`. On larger screens, the sidebar is hidden below the `md` breakpoint and renders as a fixed desktop column from `md` upward.
- **Mobile behavior.** Mobile rendering uses the `side` value for the Sheet direction and keeps the sidebar contents in a full-height flex column. The mobile Sheet includes an accessible title and description. Its built-in close button is hidden, so keep `UISidebarTrigger` or another control available to close it.
- **Desktop layout.** The provider sets `--sidebar-width` to `16rem` and `--sidebar-width-icon` to `3rem`. The desktop sidebar uses a fixed container, a gap element that preserves the page layout, and an inner panel that receives the visual variant styles.
- **Side values.** `side` accepts `left` or `right` and defaults to `left`. The value controls the fixed container edge, the border edge, the mobile Sheet direction, the rail position, and the resize cursor.
- **Variant values.** `variant` accepts `sidebar`, `floating`, or `inset` and defaults to `sidebar`. `sidebar` uses the full width and an edge border. `floating` adds two-pixel padding, a rounded inner panel, a border ring, and a shadow. `inset` uses the same floating panel treatment and adds responsive margin, rounding, and shadow rules to `UISidebarInset`.
- **Collapsible values.** `collapsible` accepts `offcanvas`, `icon`, or `none` and defaults to `offcanvas`. `offcanvas` moves the desktop panel and its gap out of view. `icon` keeps an icon-width rail and hides text-oriented content. `none` renders a fixed-width panel without the desktop collapsed wrapper. On mobile, `offcanvas` and `icon` both use the Sheet path. `none` renders the non-collapsible panel directly.
- **State attributes.** Desktop markup exposes `data-state`, `data-collapsible`, `data-variant`, and `data-side` on the sidebar group. The inner panel exposes `data-sidebar="sidebar"`. Use these attributes and the `--sidebar-*` variables for local styling rather than duplicating state in consumers.
- **Sidebar children.** `UISidebarHeader` and `UISidebarFooter` are flex-column wrappers with padding. `UISidebarContent` is the scrollable flex region. `UISidebarGroup` owns a section. Put `UISidebarGroupLabel` and `UISidebarGroupContent` inside a group. Use `UISidebarGroupAction` for a group-level action.
- **Group props.** `UISidebarGroup`, `UISidebarGroupContent`, `UISidebarHeader`, `UISidebarFooter`, and `UISidebarInset` accept `class`. `UISidebarGroupLabel` and `UISidebarGroupAction` also accept Reka UI `PrimitiveProps`, including `as` and `as-child`, plus `class`. The label and group action hide in `collapsible="icon"` mode. Use `as-child` when a label needs to wrap a collapsible trigger.
- **Menu structure.** Use `UISidebarMenu` as a `ul`, `UISidebarMenuItem` as its `li`, and `UISidebarMenuButton` as the item control. Put `UISidebarMenuAction` beside the button inside the item. Use `UISidebarMenuSub` inside a menu item, then place `UISidebarMenuSubItem` and `UISidebarMenuSubButton` inside the submenu.
- **Menu button props.** `UISidebarMenuButton` accepts Reka UI `PrimitiveProps`, `variant`, `size`, `is-active`, `tooltip`, and `class`. It renders a `button` by default. Set `as-child` to render an anchor or another child element. `is-active` adds the active data state and active styles.
- **Menu button variants.** `sidebarMenuButtonVariants` accepts `variant="default"` or `variant="outline"`. `default` uses the sidebar accent on hover. `outline` adds a background and a sidebar-border ring. The default is `default`.
- **Menu button sizes.** `sidebarMenuButtonVariants` and `UISidebarMenuButton` accept `size="default"`, `size="sm"`, or `size="lg"`. They render heights of `2rem`, `1.75rem`, and `3rem` respectively. Icon collapse overrides the button to an eight-unit square. The `lg` size also removes icon-collapse padding.
- **Menu button tooltips.** `tooltip` accepts a string or a Vue component. The provider supplies a zero-delay tooltip provider. The tooltip is visible only when the desktop state is `collapsed`, and it is hidden on mobile. Give icon-only buttons a useful tooltip and an accessible label in their child content.
- **Menu actions.** `UISidebarMenuAction` accepts `show-on-hover`, Reka UI `PrimitiveProps`, and `class`. It defaults to a button. `show-on-hover` hides the action on desktop until the item receives focus or hover. Actions are hidden in icon collapse mode. Add an accessible name when the action contains only an icon.
- **Badges.** Put `UISidebarMenuBadge` inside the menu item next to `UISidebarMenuButton`. It is pointer-inert, positioned at the trailing edge, and hidden in icon collapse mode. Do not make a badge the only way to reach an important action.
- **Submenus.** Use `UISidebarMenuSub` with `UISidebarMenuSubItem` and `UISidebarMenuSubButton`. `UISidebarMenuSubButton` accepts `size="sm"` or `size="md"`, `is-active`, Reka UI `PrimitiveProps`, and `class`. It renders an anchor by default and is hidden in icon collapse mode. For an expandable section, wrap the group or menu item in the separate `UICollapsible` component and use its trigger and content parts around the sidebar parts.
- **Skeletons.** `UISidebarMenuSkeleton` accepts `show-icon` and `class`. It renders a text placeholder with a random width from 50% through 89% and an optional icon placeholder. Put it inside `UISidebarMenuItem` while loading. The random width is generated during setup, so use a fixed placeholder instead when server-rendered hydration must be deterministic.
- **Input and separator wrappers.** `UISidebarInput` wraps the project's input component with sidebar sizing and no shadow. `UISidebarSeparator` wraps the project's separator with sidebar border color and horizontal margins. Both accept `class`.
- **Inset composition.** `UISidebarInset` renders a `main` element. When its sibling sidebar has `variant="inset"`, it adds desktop margin, rounding, shadow, and collapsed-state spacing through peer data selectors. Keep it as the main sibling under `UISidebarProvider`.
- **Rail.** `UISidebarRail` is a native button that calls `toggleSidebar` on click. It is hidden below `sm`, has `tabindex="-1"`, and has an accessible label and title. Use `UISidebarTrigger` for keyboard access because the rail is intentionally removed from the tab order.
- **Trigger.** `UISidebarTrigger` is a ghost icon button with the project's small icon size and an `sr-only` "Toggle Sidebar" label. It calls `toggleSidebar`, so it toggles the desktop state or the mobile Sheet depending on `isMobile`.
- **Accessibility.** Keep meaningful text inside every menu button. Use `as-child` with a real anchor for navigation. Give icon-only controls an accessible name. Keep group labels descriptive even though icon collapse hides them visually. The mobile path delegates dialog semantics and focus behavior to the project Sheet component. The submenu parts are list and link wrappers, not a complete disclosure state machine by themselves.
- **Styling.** Components merge their `class` props through `cn`. The sidebar relies on semantic `--sidebar-*` tokens and `data-sidebar` state attributes. Prefer those hooks over raw color overrides or a second open-state variable.
- **Upstream mismatch.** The official page includes empty `Props` headings for `SidebarProvider` and `Sidebar`. Its `storageKey` examples do not match this local provider. The local source in this folder is authoritative for props, defaults, utility constants, and rendered elements.

## Examples

**Basic layout.**

```vue
<template>
  <UISidebarProvider>
    <UISidebar>
      <UISidebarHeader>
        <UISidebarMenu>
          <UISidebarMenuItem>
            <UISidebarMenuButton>Workspace</UISidebarMenuButton>
          </UISidebarMenuItem>
        </UISidebarMenu>
      </UISidebarHeader>
      <UISidebarContent>
        <UISidebarGroup>
          <UISidebarGroupLabel>Navigation</UISidebarGroupLabel>
          <UISidebarGroupContent>
            <UISidebarMenu>
              <UISidebarMenuItem>
                <UISidebarMenuButton as-child :is-active="true">
                  <a href="/dashboard">Dashboard</a>
                </UISidebarMenuButton>
              </UISidebarMenuItem>
            </UISidebarMenu>
          </UISidebarGroupContent>
        </UISidebarGroup>
      </UISidebarContent>
      <UISidebarFooter />
      <UISidebarRail />
    </UISidebar>
    <UISidebarInset>
      <header class="flex h-14 items-center border-b px-4">
        <UISidebarTrigger />
      </header>
      <div class="p-4">Dashboard content</div>
    </UISidebarInset>
  </UISidebarProvider>
</template>
```

**Controlled desktop state.**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <UISidebarProvider v-model:open="open">
    <UISidebar collapsible="icon">
      <UISidebarContent>
        <UISidebarGroup>
          <UISidebarGroupContent>
            <UISidebarMenu>
              <UISidebarMenuItem>
                <UISidebarMenuButton tooltip="Dashboard"> Dashboard </UISidebarMenuButton>
              </UISidebarMenuItem>
            </UISidebarMenu>
          </UISidebarGroupContent>
        </UISidebarGroup>
      </UISidebarContent>
    </UISidebar>
    <UISidebarInset>
      <UISidebarTrigger />
    </UISidebarInset>
  </UISidebarProvider>
</template>
```

**Menu items with an action, badge, submenu, and loading row.**

```vue
<template>
  <UISidebarProvider>
    <UISidebar>
      <UISidebarContent>
        <UISidebarGroup>
          <UISidebarGroupLabel>Projects</UISidebarGroupLabel>
          <UISidebarGroupContent>
            <UISidebarMenu>
              <UISidebarMenuItem>
                <UISidebarMenuButton as-child>
                  <a href="/projects">All projects</a>
                </UISidebarMenuButton>
                <UISidebarMenuBadge>4</UISidebarMenuBadge>
                <UISidebarMenuAction aria-label="Project actions"> More </UISidebarMenuAction>
                <UISidebarMenuSub>
                  <UISidebarMenuSubItem>
                    <UISidebarMenuSubButton as-child>
                      <a href="/projects/recent">Recent</a>
                    </UISidebarMenuSubButton>
                  </UISidebarMenuSubItem>
                </UISidebarMenuSub>
              </UISidebarMenuItem>
              <UISidebarMenuItem>
                <UISidebarMenuSkeleton :show-icon="true" />
              </UISidebarMenuItem>
            </UISidebarMenu>
          </UISidebarGroupContent>
        </UISidebarGroup>
      </UISidebarContent>
    </UISidebar>
    <UISidebarInset />
  </UISidebarProvider>
</template>
```

**Mobile trigger.**

```vue
<template>
  <UISidebarProvider>
    <UISidebar side="right">
      <UISidebarContent>
        <UISidebarGroup />
      </UISidebarContent>
    </UISidebar>
    <UISidebarInset>
      <header class="flex h-14 items-center px-4">
        <UISidebarTrigger />
        <span>Settings</span>
      </header>
    </UISidebarInset>
  </UISidebarProvider>
</template>
```

Below 768px, the trigger opens or closes the right-side Sheet through `openMobile`. Above that breakpoint, the same trigger changes the desktop sidebar state.

## References

- [shadcn-vue Sidebar docs](https://shadcn-vue.com/docs/components/sidebar)
- [Reka UI Primitive](https://reka-ui.com/docs/utilities/primitive) for `as` and `as-child` composition
- [Reka UI Dialog](https://reka-ui.com/docs/components/dialog) for the mobile Sheet's dialog behavior
- [Reka UI Collapsible](https://reka-ui.com/docs/components/collapsible) for expandable sidebar groups and menu sections
- [Reka UI Tooltip](https://reka-ui.com/docs/components/tooltip) for collapsed menu button tooltips
- [Reka UI Separator](https://reka-ui.com/docs/components/separator) for separator semantics
- [Button](../button/AGENTS.md) for the button component used by `SidebarTrigger`
- [Collapsible](../collapsible/AGENTS.md) for expandable groups and menus
- [Dropdown Menu](../dropdown-menu/AGENTS.md) for menu actions in a sidebar footer or item
- [Input](../input/AGENTS.md) for inputs wrapped by `SidebarInput`
- [Separator](../separator/AGENTS.md) for the separator wrapped by `SidebarSeparator`
- [Sheet](../sheet/AGENTS.md) for mobile sidebar rendering
- [Skeleton](../skeleton/AGENTS.md) for loading placeholders
- [Tooltip](../tooltip/AGENTS.md) for collapsed menu button tooltips
