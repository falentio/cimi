# Collapsible

A panel that expands and collapses on demand, composed from `Collapsible`, `CollapsibleTrigger`, and `CollapsibleContent`.

## Conclusion

`Collapsible` is the stateful root and forwards all props and events to the reka-ui `CollapsibleRoot` primitive. `CollapsibleTrigger` and `CollapsibleContent` are mandatory children in that order; content renders only after the trigger wires the open state. The gotcha: `CollapsibleContent` unmounts on close by default, so set `:unmount-on-hide="false"` when hidden content must stay searchable or animatable.

## Usage

```vue
<template>
  <UICollapsible>
    <UICollapsibleTrigger>Can I use this in my project?</UICollapsibleTrigger>
    <UICollapsibleContent>
      Yes. Free to use for personal and commercial projects.
    </UICollapsibleContent>
  </UICollapsible>
</template>
```

## Meaningful Information

- Three exports: `Collapsible` (root), `CollapsibleTrigger`, `CollapsibleContent`.
- Nest `CollapsibleTrigger` and `CollapsibleContent` inside `Collapsible`. Trigger and content are always required.
- `Collapsible` props (from reka-ui `CollapsibleRootProps`): `open`, `defaultOpen`, `disabled`, `asChild`, `unmountOnHide`, `as`.
- `open` binds with `v-model:open`. Use `defaultOpen` only for uncontrolled state.
- `defaultOpen` default `false`.
- `unmountOnHide` default `true`; set `false` to keep content mounted while closed.
- `disabled` blocks user interaction with the trigger.
- `Collapsible` emits `update:open` with `[value: boolean]`; the root exposes an `open` slot prop.
- `CollapsibleTrigger` props: `asChild`, `as`. Default rendered element `button`.
- `CollapsibleTrigger` with `asChild` renders your child element (for example `UIButton`) as the toggle while keeping behavior.
- `CollapsibleContent` props: `asChild`, `as`, `forceMount`. Default rendered element `div`.
- `CollapsibleContent` emits `contentFound`.
- Animate content size with the `--reka-collapsible-content-width` and `--reka-collapsible-content-height` CSS variables.
- Follows the Disclosure WAI-ARIA design pattern; the trigger is keyboard operable by default.

## Examples

```vue
<!-- Uncontrolled collapsible with default visible content -->
<template>
  <UICollapsible default-open>
    <UICollapsibleTrigger>Toggle</UICollapsibleTrigger>
    <UICollapsibleContent>Details</UICollapsibleContent>
  </UICollapsible>
</template>
```

```vue
<!-- Controlled open state with v-model -->
<script setup lang="ts">
import { ref } from 'vue'

const isOpen = ref(false)
</script>

<template>
  <UICollapsible v-model:open="isOpen">
    <UICollapsibleTrigger>Toggle</UICollapsibleTrigger>
    <UICollapsibleContent>Details</UICollapsibleContent>
  </UICollapsible>
</template>
```

```vue
<!-- Trigger renders a UIButton via asChild -->
<template>
  <UICollapsible>
    <UICollapsibleTrigger as-child>
      <UIButton variant="ghost" size="icon">Toggle</UIButton>
    </UICollapsibleTrigger>
    <UICollapsibleContent>Details</UICollapsibleContent>
  </UICollapsible>
</template>
```

```vue
<!-- Keep content mounted and searchable while closed -->
<template>
  <UICollapsible :unmount-on-hide="false">
    <UICollapsibleTrigger>Toggle</UICollapsibleTrigger>
    <UICollapsibleContent>Hidden text stays in the DOM.</UICollapsibleContent>
  </UICollapsible>
</template>
```

## References

- [Collapsible](./AGENTS.md)
- [shadcn-vue Collapsible](https://shadcn-vue.com/docs/components/collapsible)
- [reka-ui Collapsible](https://reka-ui.com/docs/components/collapsible)
