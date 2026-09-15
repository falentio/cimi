# Select

A button-triggered select menu that lets a user choose one option or several options from an accessible list.

## Conclusion

Use `UISelect` as the root, put `UISelectValue` inside `UISelectTrigger`, and put `UISelectItem` components inside `UISelectContent`. `UISelectContent` already renders the portal, viewport, and scroll buttons, so consumers only provide groups, items, labels, and separators. Use `v-model` when the parent owns the value, or `default-value` for an uncontrolled initial value.

`UISelectItem` already wraps its default slot in the internal item text primitive and renders the selected check icon. Keep item content focused on its label. Use `text-value` when the label is not available as plain text.

## Usage

```vue
<template>
  <UISelect>
    <UISelectTrigger class="w-[180px]">
      <UISelectValue placeholder="Select a fruit" />
    </UISelectTrigger>
    <UISelectContent>
      <UISelectItem value="apple">Apple</UISelectItem>
      <UISelectItem value="banana">Banana</UISelectItem>
      <UISelectItem value="blueberry">Blueberry</UISelectItem>
    </UISelectContent>
  </UISelect>
</template>
```

## Meaningful Information

### Local API

`index.ts` exports exactly these components.

| Export                   | Purpose and local behavior                                                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Select`                 | Wraps Reka UI `SelectRoot` and forwards root props and root events.                                                                                                     |
| `SelectContent`          | Wraps content in a portal, renders the scroll-up button, viewport, and scroll-down button, and forwards Reka UI content props and events.                               |
| `SelectGroup`            | Wraps a group and forwards group props. Use it with `SelectLabel` for a labeled section.                                                                                |
| `SelectItem`             | Wraps an item, forwards item props, places the default slot inside internal `SelectItemText`, and renders an internal selection indicator with a Hugeicons tick icon.   |
| `SelectItemText`         | Wraps Reka UI `SelectItemText`. The normal `SelectItem` path already renders this primitive internally.                                                                 |
| `SelectLabel`            | Renders a styled group label. The local wrapper consumes its declared props and forwards only its class and slot content.                                               |
| `SelectScrollDownButton` | Wraps the Reka UI down-scroll affordance and supplies a Hugeicons down-arrow fallback. Its default slot can replace the fallback. `SelectContent` already includes one. |
| `SelectScrollUpButton`   | Wraps the Reka UI up-scroll affordance and supplies a Hugeicons up-arrow fallback. Its default slot can replace the fallback. `SelectContent` already includes one.     |
| `SelectSeparator`        | Renders a non-interactive visual separator between items or groups.                                                                                                     |
| `SelectTrigger`          | Wraps the trigger, adds the Hugeicons down-arrow icon, and adds the local `size` prop with `"default"` and `"sm"` values.                                               |
| `SelectValue`            | Renders the selected item text or its `placeholder` when no value exists.                                                                                               |

Nuxt auto-imports these PascalCase exports with the `UI` prefix because `apps/web/nuxt.config.ts` sets `prefix: 'UI'` and `componentDir: '@/components/ui'`. Use the exact template tags `<UISelect>`, `<UISelectTrigger>`, `<UISelectValue>`, `<UISelectContent>`, `<UISelectGroup>`, `<UISelectItem>`, `<UISelectItemText>`, `<UISelectLabel>`, `<UISelectSeparator>`, `<UISelectScrollUpButton>`, and `<UISelectScrollDownButton>`. Do not import these components in a template. Import lowercase helpers such as `ref` and all type-only symbols explicitly.

The index exports no `SelectIcon`, `SelectPortal`, `SelectViewport`, `SelectItemIndicator`, or `SelectArrow`. The local wrappers own the portal, viewport, icon, and indicator primitives that consumers do not need to compose.

### Required composition

- `UISelect` owns the context for every descendant. A trigger or item outside this root has no select state.
- Put `UISelectTrigger` and `UISelectContent` directly under `UISelect` in the usual composition.
- Put `UISelectValue` inside `UISelectTrigger`. Pass `placeholder` to `UISelectValue` for the empty state.
- Put `UISelectItem` inside `UISelectContent`. Ungrouped items can be direct children. Put items inside `UISelectGroup` when a section needs a `UISelectLabel`.
- Put `UISelectSeparator` between item sections. It is visual only and cannot receive focus.
- Do not add `UISelectPortal` or a viewport around `UISelectContent`. `UISelectContent` adds both internally, and its default slot renders inside the internal viewport.

### Values and root state

| Prop or binding | Template form                         | Meaning                                                                                                      |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `defaultValue`  | `default-value`                       | Sets the initial value for an uncontrolled select. Changing it after mount does not control later selection. |
| `modelValue`    | `v-model`                             | Controls the selected value and updates the parent through `update:modelValue`.                              |
| `multiple`      | `multiple` or `:multiple="true"`      | Allows several selected items. Use an array with `default-value` or `v-model`.                               |
| `defaultOpen`   | `default-open`                        | Sets the initial open state without controlling later changes.                                               |
| `open`          | `v-model:open`                        | Controls whether the list is open and updates through `update:open`.                                         |
| `disabled`      | `disabled`                            | Prevents interaction with the whole select.                                                                  |
| `required`      | `required`                            | Requires a value before the owning native form can submit.                                                   |
| `name`          | `name="fruit"`                        | Supplies the form field name for the selected value.                                                         |
| `dir`           | `dir="rtl"`                           | Sets `ltr` or `rtl` reading direction for directional behavior.                                              |
| `by`            | `:by="'id'"` or a comparison function | Controls how object values are compared.                                                                     |
| `nullableValue` | `nullable-value`                      | Sets the submitted hidden option value when the model is nullish. It defaults to an empty string.            |

Use a unique `value` on every `UISelectItem`. Literal `value="20"` is the string `"20"`. Bind a number or another non-string value with `:value`, such as `:value="20"`. In multiple mode, the model contains the selected values as an array.

Choose one state owner. Do not combine `v-model` with `default-value` for the same selection. Use `name` and `required` when the select belongs to a native form. Reka UI supplies the hidden form control used for submission.

### Items, groups, labels, and text

- `UISelectItem` requires `value`. Its `disabled` prop removes the item from pointer and keyboard selection. Its `text-value` prop supplies the typeahead text when the rendered content is complex or non-textual.
- `UISelectGroup` groups related items. `UISelectLabel` names that group and is not focusable during arrow-key navigation.
- `UISelectItemText` forwards Reka UI item-text props and renders its slot. Do not nest it inside the default slot of `UISelectItem` because `UISelectItem` already creates the internal item-text wrapper.
- The full `UISelectItem` default slot becomes the item text in this local wrapper. That text appears in `UISelectValue` after selection and supplies the default typeahead text.
- `UISelectItem` exposes an `indicator-icon` slot for replacing the built-in tick icon. The slot content belongs beside the item text only through the wrapper's internal indicator position.

### Trigger, value, and content

- `UISelectTrigger` renders a button by default and forwards Reka UI trigger props such as `disabled`, `as`, `as-child`, and `reference`. Its local `size` defaults to `"default"` and also accepts `"sm"`. The wrapper adds its arrow icon, so do not add a separate `SelectIcon` tag.
- `UISelectValue` shows the selected item's text by default. Its `placeholder` renders when the value is empty. Keep custom value content accessible and avoid styling the value itself because Reka UI uses it for positioning.
- `UISelectContent` renders through `SelectPortal` into the body, defaults to `position="item-aligned"` and `align="center"`, and forwards the Reka UI content props. Its slot is the internal viewport content.

For `position="item-aligned"`, the content follows the active item in a menu-like layout. For `position="popper"`, the content behaves like a popover and supports placement props such as `side`, `side-offset`, `align`, and `align-offset`. Collision props such as `avoid-collisions`, `collision-boundary`, and `collision-padding` are also forwarded. Reka UI exposes `--reka-select-trigger-width`, `--reka-select-trigger-height`, and `--reka-select-content-available-height` for sizing popper content.

`UISelectContent` includes `UISelectScrollUpButton` and `UISelectScrollDownButton` around its internal viewport. Reka UI uses these parts to expose overflow and scrolling. The native scrollbar is hidden by the component styles. The scroll button exports remain available, but adding them to the content slot places them inside the internal viewport and duplicates the built-in controls.

### Events

| Component         | Event                | Behavior                                                                         |
| ----------------- | -------------------- | -------------------------------------------------------------------------------- |
| `UISelect`        | `update:modelValue`  | Emits the selected value. In multiple mode, the value is an array.               |
| `UISelect`        | `update:open`        | Emits the new open state.                                                        |
| `UISelectItem`    | `select`             | Fires when an item is selected. Prevent the default event to stop selection.     |
| `UISelectContent` | `escapeKeyDown`      | Fires when Escape is pressed and can prevent the close behavior.                 |
| `UISelectContent` | `pointerDownOutside` | Fires when a pointer-down happens outside the content and can prevent dismissal. |
| `UISelectContent` | `closeAutoFocus`     | Fires before focus returns to the trigger and can prevent that focus change.     |

Use Vue's kebab-case event names in templates, such as `@update:model-value`, `@update:open`, and `@pointer-down-outside`.

### Keyboard, typeahead, and accessibility

The implementation follows Reka UI's select primitive and the WAI-ARIA listbox pattern.

- `Tab` moves focus to the trigger. The trigger receives focus when the list closes.
- `Space` or `Enter` on the trigger opens the list. Space focuses the selected item, while Enter focuses the first item.
- `ArrowDown` and `ArrowUp` open the list from the trigger and move through items while the list is open.
- `Enter` or `Space` on a focused item selects it.
- `Escape` closes the list and returns focus to the trigger.
- Type characters while the list is open to move to a matching enabled item. Reka UI uses the item text by default. Set `text-value` on `UISelectItem` when the visible content cannot provide a useful text value.
- Disabled items are skipped by pointer and keyboard selection. The local styles also apply reduced opacity and remove pointer events.
- Give the trigger an accessible name with a visible native `<label for="...">`, `aria-label`, or `aria-labelledby`. Set the matching `id` on `UISelectTrigger` when using `for`.
- Use `UISelectLabel` for a group heading inside `UISelectGroup`. It is not a replacement for the visible label that names the whole select.
- If custom content replaces the plain selected text in `UISelectValue`, provide an accessible label for that content.

### Gotchas

- `UISelectContent` already supplies the portal, viewport, and both scroll buttons. Do not recreate that anatomy with unavailable tags.
- `UISelectTrigger` already supplies the down-arrow icon. `SelectIcon` is not exported from this folder.
- `UISelectItem` already supplies `SelectItemText` and `SelectItemIndicator`. Do not add `UISelectItemText` as a nested child in the usual item composition.
- The local `UISelectLabel` wrapper does not bind its declared `for`, `as`, or `asChild` props to Reka UI. Use a native label and the trigger's `id` for the select's external label.
- `UISelectValue` and the underlying item-text primitive should not receive custom styling that changes their layout. Style the trigger or item instead.
- Use `v-model` or `default-value`, not both. Use an array for multiple selection.
- Listen for `update:modelValue` rather than a native `change` event. Use the item `select` event when selection itself must be canceled.
- Set `name` on the root, not on individual items. Set `required` on the root when native form validation must require a selection.
- Keep item values stable and distinct. Use `:value` when the value is not a string, and use `by` when object comparison needs a specific key or custom comparator.

## Examples

### Group items under labels

```vue
<template>
  <UISelect>
    <UISelectTrigger class="w-[220px]">
      <UISelectValue placeholder="Choose a timezone" />
    </UISelectTrigger>
    <UISelectContent>
      <UISelectGroup>
        <UISelectLabel>North America</UISelectLabel>
        <UISelectItem value="est">Eastern Standard Time</UISelectItem>
        <UISelectItem value="pst">Pacific Standard Time</UISelectItem>
      </UISelectGroup>
      <UISelectSeparator />
      <UISelectGroup>
        <UISelectLabel>Europe</UISelectLabel>
        <UISelectItem value="gmt">Greenwich Mean Time</UISelectItem>
        <UISelectItem value="cet">Central European Time</UISelectItem>
      </UISelectGroup>
    </UISelectContent>
  </UISelect>
</template>
```

### Control the selected value

```vue
<script setup lang="ts">
import { ref } from 'vue'

const fruit = ref('apple')
const open = ref(false)
</script>

<template>
  <div class="flex flex-col gap-2">
    <label for="controlled-fruit">Fruit</label>
    <UISelect v-model="fruit" v-model:open="open" name="fruit">
      <UISelectTrigger id="controlled-fruit" class="w-[180px]">
        <UISelectValue />
      </UISelectTrigger>
      <UISelectContent>
        <UISelectItem value="apple">Apple</UISelectItem>
        <UISelectItem value="banana">Banana</UISelectItem>
      </UISelectContent>
    </UISelect>
    <output>Selected {{ fruit }}. {{ open ? 'Open' : 'Closed' }}.</output>
  </div>
</template>
```

Use `v-model="fruits"` with `multiple` when the controlled value is an array. Use `default-value` instead when the parent does not need to react to later changes.

### Disable individual options

```vue
<template>
  <UISelect>
    <UISelectTrigger class="w-[180px]">
      <UISelectValue placeholder="Choose a plan" />
    </UISelectTrigger>
    <UISelectContent>
      <UISelectItem value="free">Free</UISelectItem>
      <UISelectItem value="pro">Pro</UISelectItem>
      <UISelectItem value="enterprise" disabled>Enterprise</UISelectItem>
    </UISelectContent>
  </UISelect>
</template>
```

## References

- [Local export index](./index.ts)
- [Local `Select.vue`](./Select.vue)
- [Local `SelectContent.vue`](./SelectContent.vue)
- [Local `SelectGroup.vue`](./SelectGroup.vue)
- [Local `SelectItem.vue`](./SelectItem.vue)
- [Local `SelectItemText.vue`](./SelectItemText.vue)
- [Local `SelectLabel.vue`](./SelectLabel.vue)
- [Local `SelectScrollDownButton.vue`](./SelectScrollDownButton.vue)
- [Local `SelectScrollUpButton.vue`](./SelectScrollUpButton.vue)
- [Local `SelectSeparator.vue`](./SelectSeparator.vue)
- [Local `SelectTrigger.vue`](./SelectTrigger.vue)
- [Local `SelectValue.vue`](./SelectValue.vue)
- [shadcn-vue Select documentation](https://shadcn-vue.com/docs/components/select)
- [Reka UI Select documentation](https://reka-ui.com/docs/components/select)
- [WAI-ARIA listbox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/listbox)
