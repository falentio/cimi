# Radio Group

A radio group presents mutually exclusive choices with accessible focus management and form submission support.

## Conclusion

Use `<UIRadioGroup>` as the parent and place one or more `<UIRadioGroupItem>` components inside it. Give every item a unique `id` and pair it with a `<UILabel>` whose `for` value matches that `id`. Use `v-model` when the parent owns the selected value, or use `default-value` for an uncontrolled initial selection.

## Usage

```vue
<template>
	<UIRadioGroup default-value="comfortable" aria-label="Density">
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="density-default" value="default" />
			<UILabel for="density-default">Default</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="density-comfortable" value="comfortable" />
			<UILabel for="density-comfortable">Comfortable</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="density-compact" value="compact" />
			<UILabel for="density-compact">Compact</UILabel>
		</div>
	</UIRadioGroup>
</template>
```

## Meaningful Information

- `index.ts` exports exactly `RadioGroup` and `RadioGroupItem`. The corresponding auto-imported template tags are `<UIRadioGroup>` and `<UIRadioGroupItem>`.
- `RadioGroup` wraps Reka UI's `RadioGroupRoot`. It forwards the root props and `update:modelValue` event after consuming the local `class` prop.
- `RadioGroupItem` wraps Reka UI's `RadioGroupItem`. It forwards item props after consuming the local `class` prop.
- The local package does not export `RadioGroupIndicator`, a helper, or a consumer-facing type. `RadioGroupItem.vue` renders the indicator and the default `CircleIcon` internally.
- `shadcn-nuxt` auto-imports the PascalCase UI exports because `apps/web/nuxt.config.ts` sets the `UI` prefix and the `@/components/ui` directory. Do not import these components in a template. Use the `UI` prefix for every other local UI component, such as `<UILabel>`.
- Lowercase helpers and type-only exports require explicit imports. Import `ref` from `vue` when a controlled example uses it.
- The group must own the items. An item outside a `<UIRadioGroup>` has no group state or roving focus context.
- The group renders as a `div` by default. An item renders as a `button` by default. Use `as` or `as-child` only when the replacement preserves the radio group semantics and forwarded attributes.
- The group has `data-slot="radio-group"`. An item has `data-slot="radio-group-item"`. The internal indicator has `data-slot="radio-group-indicator"`. Local classes merge with the component's base classes through `cn`.

### Group props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `as` | `AsTag \| Component` | `"div"` | Changes the rendered group element or component. |
| `asChild` | `boolean` | `false` | Merges the group behavior into one child element or component. |
| `class` | `HTMLAttributes['class']` | unset | Merges classes with the local `grid gap-2 w-full` styles. |
| `defaultValue` | `AcceptableValue` | unset | Sets the initial selected item for uncontrolled use. |
| `dir` | `"ltr" \| "rtl"` | inherited or LTR | Sets reading direction for directional keyboard navigation. |
| `disabled` | `boolean` | `false` | Prevents interaction with every item in the group. |
| `loop` | `boolean` | `true` | Wraps arrow-key navigation from the last item to the first item and back. |
| `modelValue` | `AcceptableValue` | unset | Controls the selected item and binds through `v-model`. |
| `name` | `string` | unset | Names the form field submitted with the selected value. |
| `orientation` | `"vertical" \| "horizontal"` | unset | Sets the group's orientation for layout and keyboard navigation. |
| `required` | `boolean` | `false` | Requires a selection before the owning form can submit. |

### Item props

| Prop | Type | Default | Meaning |
| --- | --- | --- | --- |
| `as` | `AsTag \| Component` | `"button"` | Changes the rendered item element or component. |
| `asChild` | `boolean` | `false` | Merges the item behavior into one child element or component. |
| `class` | `HTMLAttributes['class']` | unset | Merges classes with the local radio item styles. |
| `disabled` | `boolean` | `false` | Prevents interaction with this item. |
| `id` | `string` | unset | Identifies the item for its associated label. |
| `name` | `string` | unset | Sets the form field name for this item when needed. The group `name` is usually enough. |
| `required` | `boolean` | unset | Marks the item as required for form behavior. Set `required` on the group for the usual group-level constraint. |
| `value` | `AcceptableValue` | unset | Stores this item's value and identifies it as the selected item. |

### Values and state

- `AcceptableValue` supports `string`, `number`, `bigint`, a record, or `null`. The group holds one selected value, not an array.
- Bind a string with `value="comfortable"`. Bind a number with `:value="20"`; `value="20"` is the string `"20"`.
- Give sibling items distinct `value` values so the group can identify each choice.
- `v-model` maps to the group's `modelValue` prop and `update:modelValue` event. The bound value becomes the selected item's exact `value`.
- Use `default-value` only for the initial state of an uncontrolled group. Use `v-model` when later changes come from parent state. Do not rely on changing `default-value` after mount to change the selection.
- Set `name` on the group when the selection belongs to a native form. Reka UI renders a native input for an item inside a form so the selected name and value can be submitted.
- Set `disabled` on the group to disable every item. Set it on an item to disable only that choice.
- Set `required` on the group when the form must contain a selection. Keep at least one enabled item available when the group is required.

### Events and slots

| Component | Event or slot | Payload or behavior |
| --- | --- | --- |
| `RadioGroup` | `update:modelValue` | Emits the selected `AcceptableValue` when the selection changes. Use `@update:model-value` when handling the event directly. |
| `RadioGroup` | Default slot | Renders the items and receives the Reka UI root slot props, including the current `modelValue`. |
| `RadioGroupItem` | `select` | The Reka UI item selection event is available as `@select`. |
| `RadioGroupItem` | Default slot | Replaces the built-in circle inside the internal indicator. The local wrapper does not provide slot props. |

### Focus and accessibility

- The implementation follows the WAI-ARIA radio group pattern. The root and items provide the group and radio semantics through Reka UI.
- Roving focus keeps one radio item in the tab sequence. `Tab` moves focus to the checked item or to the first item when no item is checked.
- `Space` checks the focused item when it is unchecked.
- `ArrowDown` and `ArrowRight` move focus to and check the next item.
- `ArrowUp` and `ArrowLeft` move focus to and check the previous item.
- `loop` defaults to `true`. Set `:loop="false"` to stop at the first and last items instead of wrapping.
- Set `orientation="horizontal"` or `orientation="vertical"` to describe the group layout and its directional navigation.
- Give every item a unique `id`. Pair it with `<UILabel for="item-id">` so the visible text names the custom radio control.
- Add `aria-label` when the group has no visible name. Use `aria-labelledby` when a visible heading already names the group.
- The components do not render labels for you. An item without a paired label or an equivalent accessible name is unlabeled.

### Gotchas

- Do not add an indicator tag. `RadioGroupIndicator` is not exported by this folder. The item includes the indicator and built-in circle icon.
- The item default slot is inside the indicator. It replaces the circle, rather than adding content beside the radio button.
- Do not use an array for `v-model`. Use a checkbox group for independent multi-selection.
- Do not combine `v-model` and `default-value` as two sources of truth. Choose controlled or uncontrolled state.
- Do not reuse an `id` across radio group instances. Duplicate ids break label pairing.
- A disabled item cannot be selected by pointer or keyboard navigation. A group with every item disabled cannot satisfy a required form field.
- `as-child` transfers behavior to one child. The child must accept the forwarded props and preserve the radio semantics.

## Examples

### Control the selected value

```vue
<script setup lang="ts">
import { ref } from 'vue'

const density = ref('comfortable')
</script>

<template>
	<UIRadioGroup v-model="density" aria-label="Density">
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="controlled-default" value="default" />
			<UILabel for="controlled-default">Default</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="controlled-comfortable" value="comfortable" />
			<UILabel for="controlled-comfortable">Comfortable</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="controlled-compact" value="compact" />
			<UILabel for="controlled-compact">Compact</UILabel>
		</div>
	</UIRadioGroup>
</template>
```

### Use numeric values

```vue
<script setup lang="ts">
import { ref } from 'vue'

const pageSize = ref(20)
</script>

<template>
	<UIRadioGroup v-model="pageSize" aria-label="Rows per page">
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="rows-20" :value="20" />
			<UILabel for="rows-20">20</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="rows-50" :value="50" />
			<UILabel for="rows-50">50</UILabel>
		</div>
	</UIRadioGroup>
</template>
```

### Submit a required group

```vue
<template>
	<form>
		<fieldset class="flex flex-col gap-3">
			<legend id="billing-cycle-label">Billing cycle</legend>
			<UIRadioGroup
				name="billing-cycle"
				required
				orientation="horizontal"
				aria-labelledby="billing-cycle-label"
			>
				<div class="flex items-center gap-2">
					<UIRadioGroupItem id="billing-monthly" value="monthly" />
					<UILabel for="billing-monthly">Monthly</UILabel>
				</div>
				<div class="flex items-center gap-2">
					<UIRadioGroupItem id="billing-yearly" value="yearly" />
					<UILabel for="billing-yearly">Yearly</UILabel>
				</div>
			</UIRadioGroup>
		</fieldset>
		<button type="submit">Continue</button>
	</form>
</template>
```

### Stop focus at the ends

```vue
<template>
	<UIRadioGroup orientation="horizontal" :loop="false" aria-label="Layout">
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="layout-list" value="list" />
			<UILabel for="layout-list">List</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="layout-grid" value="grid" />
			<UILabel for="layout-grid">Grid</UILabel>
		</div>
		<div class="flex items-center gap-2">
			<UIRadioGroupItem id="layout-table" value="table" disabled />
			<UILabel for="layout-table">Table</UILabel>
		</div>
	</UIRadioGroup>
</template>
```

## References

- [Local `RadioGroup.vue`](./RadioGroup.vue)
- [Local `RadioGroupItem.vue`](./RadioGroupItem.vue)
- [Local export index](./index.ts)
- [Label guide](../label/AGENTS.md)
- [shadcn-vue Radio Group documentation](https://shadcn-vue.com/docs/components/radio-group)
- [Reka UI Radio Group documentation](https://reka-ui.com/docs/components/radio-group)
- [WAI-ARIA radio group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radiobutton)
