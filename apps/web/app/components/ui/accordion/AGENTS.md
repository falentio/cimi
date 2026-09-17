# Accordion

Vertically stacked headings that each reveal a content section on toggle. Reach for it when space is tight and only one or a few sections need to be visible at once.

## Conclusion

`Accordion` is the root and accepts reka-ui `AccordionRoot` props; `AccordionItem`, `AccordionTrigger`, and `AccordionContent` are always nested inside it in that order, and all four are mandatory. `type` is required and picks single or multiple behavior; `collapsible` only affects `type="single"`. The gotcha is that `AccordionTrigger` renders its own `AccordionHeader` wrapper, so never add a header yourself.

## Usage

```vue
<template>
  <UIAccordion type="single" collapsible>
    <UIAccordionItem value="item-1">
      <UIAccordionTrigger>Is it accessible?</UIAccordionTrigger>
      <UIAccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</UIAccordionContent>
    </UIAccordionItem>
  </UIAccordion>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIAccordion>`, `<UIAccordionItem>`, `<UIAccordionTrigger>`, and `<UIAccordionContent>` in templates with no import.
- Import from `@/components/ui/accordion`. It exports exactly `Accordion`, `AccordionContent`, `AccordionItem`, `AccordionTrigger`.
- Required nesting: `Accordion` > `AccordionItem` > `AccordionTrigger` then `AccordionContent`. `AccordionItem` requires a unique `value` string.
- `Accordion type` accepts `"single"` or `"multiple"`. `type` is required.
- `Accordion collapsible` takes a boolean and applies only to `type="single"`; without it the last open item cannot be closed. Ignore it for `type="multiple"`.
- `Accordion` is uncontrolled by default. Pass `default-value` for the initially open item or `v-model` for controlled state. With `type="multiple"` the value is a string array; with `type="single"` it is a string.
- `Accordion` emits `update:value` (v-model). Listen with `@update:value`.
- `Accordion orientation` accepts `"vertical"` (default) or `"horizontal"`, driving arrow-key navigation.
- `Accordion :unmount-on-hide="false"` keeps closed content mounted so browser find and hidden text still work. Default `true` unmounts it.
- `AccordionItem disabled` sets the item non-interactive.
- All four parts accept a `class` prop merged through `cn`.
- `AccordionTrigger` wraps itself in `AccordionHeader` and renders a custom icon slot. Override the arrow with `<template #icon>`, and never wrap the trigger in your own header.
- Accessibility: the trigger is a real button and the root follows the WAI-ARIA accordion pattern. Space and Enter toggle the focused trigger; Arrow keys move by `orientation`; Home and End jump to the first and last trigger. Keep trigger text meaningful.

## Examples

```vue
<!-- Item expanded by default -->
<UIAccordion type="single" default-value="item-2">
  <UIAccordionItem value="item-1">
    <UIAccordionTrigger>Title 1</UIAccordionTrigger>
    <UIAccordionContent>Content 1</UIAccordionContent>
  </UIAccordionItem>
  <UIAccordionItem value="item-2">
    <UIAccordionTrigger>Title 2</UIAccordionTrigger>
    <UIAccordionContent>Content 2</UIAccordionContent>
  </UIAccordionItem>
</UIAccordion>
```

```vue
<!-- Multiple sections open at once, controlled -->
<script setup lang="ts">
import { ref } from 'vue'
const open = ref<string[]>(['item-1'])
</script>

<template>
  <UIAccordion type="multiple" v-model="open">
    <UIAccordionItem value="item-1">
      <UIAccordionTrigger>Title 1</UIAccordionTrigger>
      <UIAccordionContent>Content 1</UIAccordionContent>
    </UIAccordionItem>
  </UIAccordion>
</template>
```

```vue
<!-- Custom trigger icon -->
<UIAccordion type="single" collapsible>
  <UIAccordionItem value="item-1">
    <UIAccordionTrigger>
      Title
      <template #icon>
        <span>+</span>
      </template>
    </UIAccordionTrigger>
    <UIAccordionContent>Content</UIAccordionContent>
  </UIAccordionItem>
</UIAccordion>
```

```vue
<!-- Keep closed content mounted for in-page search -->
<UIAccordion type="single" collapsible :unmount-on-hide="false">
  <UIAccordionItem value="item-1">
    <UIAccordionTrigger>Title</UIAccordionTrigger>
    <UIAccordionContent>Content</UIAccordionContent>
  </UIAccordionItem>
</UIAccordion>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/accordion)
- [reka-ui Accordion](https://reka-ui.com/docs/components/accordion)
- [WAI-ARIA accordion pattern](https://www.w3.org/WAI/ARIA/apg/patterns/accordion)
