# Tabs

An accessible tabs primitive that shows one content panel at a time and supports horizontal or vertical navigation.

## Conclusion

Use `UITabs` as the root, place `UITabsList` inside it, and put every `UITabsTrigger` directly inside the list. Give each trigger a unique `value` and pair it with a `UITabsContent` that has the same `value`. Use `default-value` for initial uncontrolled state and `v-model` when the parent owns the active tab.

## Usage

`shadcn-nuxt` scans `@/components/ui` and prefixes component exports with `UI`, as configured in `apps/web/nuxt.config.ts`. Use the exact tags below without importing the components.

The smallest valid composition uses one root, one list, one or more triggers, and matching content panels.

```vue
<template>
  <UITabs default-value="account">
    <UITabsList aria-label="Account settings">
      <UITabsTrigger value="account">Account</UITabsTrigger>
      <UITabsTrigger value="password">Password</UITabsTrigger>
    </UITabsList>
    <UITabsContent value="account">Account settings.</UITabsContent>
    <UITabsContent value="password">Password settings.</UITabsContent>
  </UITabs>
</template>
```

## Meaningful Information

### Exports and imports

- `index.ts` exports `Tabs`, `TabsContent`, `TabsList`, and `TabsTrigger` from the four local Vue files.
- The Nuxt auto-import names are `UITabs`, `UITabsContent`, `UITabsList`, and `UITabsTrigger`. Use these tags in templates without component imports.
- `index.ts` also exports the lowercase `tabsListVariants` helper. Import it explicitly from `@/components/ui/tabs` when JavaScript or TypeScript needs the generated list classes.
- `index.ts` exports the type-only `TabsListVariants` type. Import it explicitly with `import type` from `@/components/ui/tabs`.
- The local directory does not export `TabsIndicator`. Do not use `UITabsIndicator` with this component family.

```ts
import { tabsListVariants } from '@/components/ui/tabs'
import type { TabsListVariants } from '@/components/ui/tabs'
```

### Composition and values

- Put `UITabsList` inside `UITabs`.
- Put every `UITabsTrigger` directly inside `UITabsList`. Do not render a trigger beside the list.
- Put `UITabsContent` inside `UITabs` alongside the list.
- Give every trigger a unique `value`. The value accepts a string or number.
- Give every content panel the exact value of its trigger. Matching values connect the trigger to its panel.
- Keep trigger labels short and meaningful. Use `aria-label` or `aria-labelledby` on `UITabsList` when the visible list has no label.

### Root props and state

- `UITabs` wraps Reka UI `TabsRoot` and forwards its root props, emits, and slot.
- `default-value` maps to `defaultValue` and sets the initially active tab for uncontrolled usage. It is read on initial render and does not control later changes.
- `v-model` binds `modelValue` and controls the active tab. The bound value must match one of the trigger and content values.
- `orientation` accepts `"horizontal"` or `"vertical"` and defaults to `"horizontal"`. It also determines arrow-key navigation.
- `activation-mode` maps to `activationMode`, accepts `"automatic"` or `"manual"`, and defaults to `"automatic"`.
- `dir` accepts `"ltr"` or `"rtl"`. When omitted, the root inherits the configured direction or uses left-to-right direction.
- `unmount-on-hide` maps to `unmountOnHide` and defaults to `true`. Set `:unmount-on-hide="false"` when inactive content must stay mounted.
- `as` changes the root element. `as-child` replaces the root element with one child while preserving tabs behavior.
- `class` is merged with the local root classes through `cn`.

### List props and variants

- `UITabsList` wraps Reka UI `TabsList` and forwards its props.
- `variant` is local to this wrapper. It accepts `"default"` or `"line"` and defaults to `"default"`.
- The `default` variant uses a muted list background and a filled active trigger.
- The `line` variant removes the list background and marks the active trigger with an underline.
- `loop` defaults to `true`. Set `:loop="false"` to stop arrow navigation at the first or last trigger.
- `as`, `as-child`, and `class` are also forwarded or merged by the wrapper.
- `tabsListVariants` is the class-variance-authority helper that defines the local `variant` values. Use it instead of duplicating the variant class strings.

### Trigger props and disabled tabs

- `UITabsTrigger` wraps Reka UI `TabsTrigger` and renders a button by default.
- `value` is required and links the trigger to one `UITabsContent` panel.
- `disabled` defaults to `false`. A disabled trigger cannot be clicked or activated from the keyboard, and the tabs roving focus behavior skips it.
- `as` changes the rendered element. `as-child` merges tabs behavior into one child element. Keep that child a single accessible interactive control.
- `class` is merged with the local trigger classes. The local styles read `data-state`, `data-disabled`, `data-orientation`, and the parent list variant.

### Content props

- `UITabsContent` wraps Reka UI `TabsContent` and renders a `div` by default.
- `value` is required and must exactly match one trigger value.
- `force-mount` maps to `forceMount` and keeps a panel mounted when more control is needed for animations. Root `unmount-on-hide` controls the default inactive-panel behavior.
- `as`, `as-child`, and `class` are forwarded or merged by the wrapper.

### Events and slots

- `UITabs` emits `update:modelValue` with the new active value. Vue maps this event to `v-model`. Listen with `@update:model-value` when an explicit handler is needed.
- `UITabsList`, `UITabsTrigger`, and `UITabsContent` add no local emits. Their Reka UI props and behavior pass through the wrappers.
- The root slot exposes the current `modelValue` through the Reka UI slot contract.

### Keyboard behavior

- `Tab` moves focus into the active trigger when focus enters the tab list. It moves focus out of the list according to the page tab order.
- In a horizontal list, `ArrowLeft` and `ArrowRight` move between triggers. Direction follows `dir`.
- In a vertical list, `ArrowUp` and `ArrowDown` move between triggers.
- `Home` moves focus to the first enabled trigger. `End` moves focus to the last enabled trigger.
- With the default `activation-mode="automatic"`, arrow, `Home`, and `End` navigation activates the focused trigger.
- With `activation-mode="manual"`, navigation moves focus without changing the active panel. Press `Enter` or `Space` to activate the focused trigger.
- `loop` on `UITabsList` controls whether navigation wraps from the last trigger to the first trigger.

### Accessibility

- Reka UI supplies the tab list, tab, and tab panel roles and connects each trigger with its matching content panel.
- The active trigger exposes the selected state, and inactive panels are hidden or unmounted according to the root and content mounting props.
- Give the list an accessible name when its visible context does not already label it. Use `aria-label` for a short label or `aria-labelledby` for a visible heading.
- Keep the default trigger button or make an `as-child` replacement keyboard accessible. Do not place a second interactive element inside a trigger.
- Automatic activation works best when switching panels does not have noticeable latency. Use manual activation when loading a panel would make focus movement slow.

### Gotchas

- Use `default-value`, `activation-mode`, `unmount-on-hide`, and `force-mount` in kebab case in Vue templates.
- Changing `default-value` after mount does not change the active tab. Use `v-model` for reactive control.
- A trigger without a matching content value does not display a panel. A content panel without a matching trigger is not reachable through the tab list.
- `orientation="vertical"` changes the Reka UI orientation data and keyboard direction. The local list supplies the vertical column layout, while the root keeps its flex layout.
- The `line` variant is a `UITabsList` prop, not a root prop. Write `<UITabsList variant="line">`.
- The local component family has no item wrapper. Do not add a made-up `UITabsItem` around each trigger.

## Examples

### Default tabs

Use the default variant when the list should have the muted background treatment.

```vue
<template>
  <UITabs default-value="account" class="w-full max-w-md">
    <UITabsList aria-label="Settings sections">
      <UITabsTrigger value="account">Account</UITabsTrigger>
      <UITabsTrigger value="password">Password</UITabsTrigger>
    </UITabsList>
    <UITabsContent value="account">Update your account details.</UITabsContent>
    <UITabsContent value="password">Change your password.</UITabsContent>
  </UITabs>
</template>
```

### Line variant

Pass `variant="line"` to the list for the underline treatment.

```vue
<template>
  <UITabs default-value="overview">
    <UITabsList variant="line" aria-label="Project sections">
      <UITabsTrigger value="overview">Overview</UITabsTrigger>
      <UITabsTrigger value="activity">Activity</UITabsTrigger>
    </UITabsList>
    <UITabsContent value="overview">Project overview.</UITabsContent>
    <UITabsContent value="activity">Recent project activity.</UITabsContent>
  </UITabs>
</template>
```

### Vertical tabs

Set `orientation="vertical"` to place the list beside the content and use up and down arrow navigation.

```vue
<template>
  <UITabs default-value="profile" orientation="vertical" class="flex-row">
    <UITabsList aria-label="Profile sections">
      <UITabsTrigger value="profile">Profile</UITabsTrigger>
      <UITabsTrigger value="notifications">Notifications</UITabsTrigger>
      <UITabsTrigger value="security">Security</UITabsTrigger>
    </UITabsList>
    <UITabsContent value="profile">Profile settings.</UITabsContent>
    <UITabsContent value="notifications">Notification settings.</UITabsContent>
    <UITabsContent value="security">Security settings.</UITabsContent>
  </UITabs>
</template>
```

### Controlled tabs

Bind `v-model` when another part of the page needs to read or change the active tab.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref('account')
</script>

<template>
  <UITabs v-model="activeTab">
    <UITabsList aria-label="Account settings">
      <UITabsTrigger value="account">Account</UITabsTrigger>
      <UITabsTrigger value="password">Password</UITabsTrigger>
    </UITabsList>
    <UITabsContent value="account">Account settings.</UITabsContent>
    <UITabsContent value="password">Password settings.</UITabsContent>
  </UITabs>
</template>
```

## References

- [Official shadcn-vue Tabs documentation](https://shadcn-vue.com/docs/components/tabs)
- [Reka UI Tabs documentation](https://reka-ui.com/docs/components/tabs)
- [WAI-ARIA Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [Local tabs exports](./index.ts)
