# Navigation Menu

An accessible collection of navigation links with trigger-controlled content panels.

## Conclusion

Compose `UINavigationMenu` with one `UINavigationMenuList` and `UINavigationMenuItem` children. A dropdown item pairs one `UINavigationMenuTrigger` with its matching `UINavigationMenuContent`. A direct destination uses `UINavigationMenuLink`. The local root adds `UINavigationMenuViewport` by default, so add an explicit viewport only after setting `:viewport="false"`. Use `UINavigationMenuLink` for every navigational link, including links inside content panels.

## Usage

Nuxt configures shadcn-vue with the `UI` prefix and `@/components/ui` as the component directory. Use the exact `UI`-prefixed tags below without importing components. Import lowercase helpers such as `navigationMenuTriggerStyle` explicitly from `@/components/ui/navigation-menu`. This folder re-exports no types. Import any Reka UI types directly from `reka-ui` when TypeScript needs them.

```vue
<template>
  <UINavigationMenu aria-label="Primary navigation">
    <UINavigationMenuList>
      <UINavigationMenuItem>
        <UINavigationMenuTrigger>Products</UINavigationMenuTrigger>
        <UINavigationMenuContent>
          <UINavigationMenuLink as-child>
            <a href="/products">All products</a>
          </UINavigationMenuLink>
        </UINavigationMenuContent>
      </UINavigationMenuItem>
      <UINavigationMenuItem>
        <UINavigationMenuLink as-child>
          <a href="/docs">Documentation</a>
        </UINavigationMenuLink>
      </UINavigationMenuItem>
    </UINavigationMenuList>
  </UINavigationMenu>
</template>
```

## Meaningful Information

- `index.ts` exports `NavigationMenu`, `NavigationMenuContent`, `NavigationMenuIndicator`, `NavigationMenuItem`, `NavigationMenuLink`, `NavigationMenuList`, `NavigationMenuTrigger`, `NavigationMenuViewport`, and `navigationMenuTriggerStyle`. The component exports become `UINavigationMenu`, `UINavigationMenuContent`, `UINavigationMenuIndicator`, `UINavigationMenuItem`, `UINavigationMenuLink`, `UINavigationMenuList`, `UINavigationMenuTrigger`, and `UINavigationMenuViewport` in templates.
- `UINavigationMenu` is the root. It renders a `nav` by default, forwards Reka UI root props and events, and accepts the local `viewport` boolean. `viewport` defaults to `true`, which appends one `UINavigationMenuViewport` after the root slot.
- `UINavigationMenuList` belongs directly inside the root and contains the top-level items. `UINavigationMenuItem` belongs directly inside the list and renders an `li` by default.
- A dropdown item must contain one `UINavigationMenuTrigger` followed by its matching `UINavigationMenuContent`. A direct item can contain one `UINavigationMenuLink` instead. Keep the trigger and content in the same item.
- `UINavigationMenuContent` holds the panel for its sibling trigger. Put `UINavigationMenuLink` around every navigational anchor in that panel. Use ordinary layout elements such as `ul`, `li`, and `div` only to arrange the panel contents.
- `UINavigationMenuLink` renders an anchor-like Reka UI primitive. Its `active` prop marks the current page, sets the active state used by local styles, and supplies the primitive's `aria-current` behavior. It does not select or open a root content panel.
- `UINavigationMenuTrigger` renders a button-like control and adds the local Hugeicons down arrow. The arrow rotates while the trigger is open. Do not add a second arrow for the default trigger.
- `UINavigationMenuIndicator` is optional. Place it inside `UINavigationMenuList`, after the items, to show the active trigger. The local wrapper already renders its small diamond indicator.
- `UINavigationMenuViewport` is optional and renders active content outside the list. The local wrapper puts it in an absolutely positioned container below the root. Its width and height use `--reka-navigation-menu-viewport-width` and `--reka-navigation-menu-viewport-height`.
- The folder does not export `NavigationMenuSub`. Upstream Reka UI documents nested submenus, but this local component set cannot use a `UINavigationMenuSub` tag without adding another export.
- The root `orientation` accepts `"horizontal"` or `"vertical"` and defaults to `"horizontal"`. The value also reaches the list, content, viewport, and indicator through Reka UI context. Set `dir="ltr"` or `dir="rtl"` when the reading direction differs from the application default.
- `delay-duration` controls the pointer-entry delay before a trigger opens and defaults to `200`. `skip-delay-duration` gives the pointer `300` milliseconds to enter another trigger without the full delay. `disable-hover-trigger`, `disable-click-trigger`, and `disable-pointer-leave-close` change the default pointer behavior.
- Use `default-value` for an initial uncontrolled active item. Use `v-model` for a controlled root value. Give controlled `UINavigationMenuItem` elements unique `value` strings, then bind the root to one of those strings.
- Root `v-model` maps to Reka UI's `modelValue` and emits `update:modelValue`. In a template, listen with `@update:model-value`. The root value selects the open content item. It is separate from a link's `active` prop.
- `UINavigationMenuLink` emits `select`. Call `event.preventDefault()` in its handler when the menu must stay open after selection. `UINavigationMenuContent` forwards `escape-key-down`, `focus-outside`, `interact-outside`, and `pointer-down-outside`. Each event can be prevented.
- Closed content unmounts by default through `unmount-on-hide`. Set it to `false` when closed panel DOM must remain mounted. Use `force-mount` on content, the indicator, or the viewport when an animation system needs a mounted part. `UINavigationMenuViewport` also accepts `align="start"`, `align="center"`, or `align="end"`.
- All Reka-backed parts accept `as` and `as-child`. `as-child` merges the part's behavior into one child element or component. Use it on `UINavigationMenuLink` around an anchor or router link. Keep one child inside an `as-child` wrapper. The local trigger adds an arrow after its slot, so prefer `as-child` on links rather than triggers.
- `navigationMenuTriggerStyle()` is a class-variance-authority helper with the local trigger styling. Apply it to a direct `UINavigationMenuLink` when that link should look like a trigger. It has no declared variants or arguments.
- The local wrappers merge a supplied `class` after their default classes. Use `class` for layout and width, and use semantic tokens or existing component styles for colors. `UINavigationMenuContent` is full width on narrow screens and switches to automatic width at `md`. `UINavigationMenuViewport` is full width on narrow screens and uses its computed width at `md`. Put responsive grid and width classes on the content's inner layout.
- The component follows the WAI-ARIA navigation pattern, not the `menu` or `menubar` pattern. Give a page-level menu an accessible label when the navigation landmark needs one. Keep visible names on triggers and links, and mark the current destination with `active`.
- `Space` or `Enter` opens a focused trigger. `Tab` moves to the next focusable element. In a horizontal menu, `ArrowDown` enters open content and `ArrowLeft` or `ArrowRight` moves between top-level triggers. In a vertical menu, `ArrowRight` enters open content and `ArrowUp` or `ArrowDown` moves between triggers. `Home` and `End` move to the first or last trigger or link. `Escape` closes content and returns focus to its trigger.
- Useful local styling hooks are `data-slot="navigation-menu"`, `navigation-menu-list`, `navigation-menu-item`, `navigation-menu-link`, `navigation-menu-trigger`, `navigation-menu-content`, `navigation-menu-indicator`, and `navigation-menu-viewport`. State attributes include `data-open`, `data-closed`, `data-active`, `data-motion`, and `data-orientation`.

## Examples

Control the active content item, change orientation and pointer timing, and keep the panel open after selecting a link.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const activeItem = ref('products')

function keepPanelOpen(event: Event) {
  event.preventDefault()
}
</script>

<template>
  <UINavigationMenu
    v-model="activeItem"
    orientation="vertical"
    :delay-duration="300"
    :skip-delay-duration="500"
    aria-label="Settings navigation"
  >
    <UINavigationMenuList>
      <UINavigationMenuItem value="products">
        <UINavigationMenuTrigger>Products</UINavigationMenuTrigger>
        <UINavigationMenuContent>
          <UINavigationMenuLink as-child @select="keepPanelOpen">
            <a href="/products">Overview</a>
          </UINavigationMenuLink>
        </UINavigationMenuContent>
      </UINavigationMenuItem>
      <UINavigationMenuItem value="billing">
        <UINavigationMenuTrigger>Billing</UINavigationMenuTrigger>
        <UINavigationMenuContent>
          <UINavigationMenuLink as-child>
            <a href="/billing">Invoices</a>
          </UINavigationMenuLink>
        </UINavigationMenuContent>
      </UINavigationMenuItem>
    </UINavigationMenuList>
  </UINavigationMenu>
</template>
```

Use an explicit viewport and the shared trigger style for a direct active link. Set `:viewport="false"` so the root does not add a second viewport.

```vue
<script setup lang="ts">
import { navigationMenuTriggerStyle } from '@/components/ui/navigation-menu'
</script>

<template>
  <UINavigationMenu :viewport="false" aria-label="Resources navigation">
    <UINavigationMenuList>
      <UINavigationMenuItem>
        <UINavigationMenuTrigger>Resources</UINavigationMenuTrigger>
        <UINavigationMenuContent>
          <div class="grid gap-2 md:w-[420px] md:grid-cols-2">
            <UINavigationMenuLink as-child>
              <a href="/guides">Guides</a>
            </UINavigationMenuLink>
            <UINavigationMenuLink as-child>
              <a href="/reference">Reference</a>
            </UINavigationMenuLink>
          </div>
        </UINavigationMenuContent>
      </UINavigationMenuItem>
      <UINavigationMenuItem>
        <UINavigationMenuLink as-child active :class="navigationMenuTriggerStyle()">
          <a href="/docs">Docs</a>
        </UINavigationMenuLink>
      </UINavigationMenuItem>
      <UINavigationMenuIndicator />
    </UINavigationMenuList>
    <UINavigationMenuViewport />
  </UINavigationMenu>
</template>
```

Use `as-child` with a routing component when the router owns link navigation. The child must be the only element inside `UINavigationMenuLink`.

```vue
<template>
  <UINavigationMenu aria-label="Account navigation">
    <UINavigationMenuList>
      <UINavigationMenuItem>
        <UINavigationMenuLink as-child>
          <a href="/account">Account</a>
        </UINavigationMenuLink>
      </UINavigationMenuItem>
    </UINavigationMenuList>
  </UINavigationMenu>
</template>
```

## References

- [shadcn-vue Navigation Menu](https://shadcn-vue.com/docs/components/navigation-menu)
- [Reka UI Navigation Menu](https://reka-ui.com/docs/components/navigation-menu)
- [WAI-ARIA navigation role requirements](https://www.w3.org/TR/wai-aria-1.2/#navigation)
- [WAI-ARIA disclosure navigation example](https://w3c.github.io/aria-practices/examples/disclosure/disclosure-navigation.html)
- [Menubar](../menubar/AGENTS.md)
