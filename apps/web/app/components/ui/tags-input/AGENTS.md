# Tags Input

Accepts a typed sequence of values and renders each value as a removable tag.

## Conclusion

Use `<UITagsInput>` as the root for a tag array and compose `<UITagsInputItem>`, `<UITagsInputItemText>`, `<UITagsInputItemDelete>`, and `<UITagsInputInput>` inside it. Bind the root with `v-model` to an array. The component adds values from typing, removes values through the delete button or keyboard navigation, and does not provide inline editing.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'

const tags = ref(['Apple', 'Banana'])
</script>

<template>
	<label for="fruits">Fruits</label>
	<UITagsInput id="fruits" v-model="tags" class="w-[300px]">
		<UITagsInputItem v-for="tag in tags" :key="tag" :value="tag">
			<UITagsInputItemText />
			<UITagsInputItemDelete />
		</UITagsInputItem>
		<UITagsInputInput placeholder="Add a fruit" />
	</UITagsInput>
</template>
```

`shadcn-nuxt` auto-imports the five local exports with the `UI` prefix. Do not import these components in a template. Import Vue helpers, type-only symbols, lowercase helpers, icons, and third-party APIs explicitly.

## Meaningful Information

- `index.ts` exports `TagsInput`, `TagsInputInput`, `TagsInputItem`, `TagsInputItemDelete`, and `TagsInputItemText`. Nuxt exposes them as `<UITagsInput>`, `<UITagsInputInput>`, `<UITagsInputItem>`, `<UITagsInputItemDelete>`, and `<UITagsInputItemText>`.
- The local index exports components only. It does not re-export `TagsInputClear`, `AcceptableInputValue`, `TagsInputRootProps`, or `TagsInputRootEmits` from `reka-ui`. Import Reka types with `import type` when a script needs them.
- `<UITagsInput>` wraps Reka UI's `TagsInputRoot` and forwards root props and emits through `useForwardPropsEmits`. It renders a styled flex container and forwards its default slot.
- `<UITagsInputInput>` wraps Reka UI's `TagsInputInput` and forwards its props. It renders a text input with autocomplete, autocorrect, and autocapitalize disabled. Its local props are `placeholder`, `autoFocus`, `maxLength`, `as`, `asChild`, and `class`.
- `<UITagsInputItem>` wraps Reka UI's `TagsInputItem`. Its required `value` must match one value in the root model. Its optional props are `disabled`, `as`, `asChild`, and `class`.
- `<UITagsInputItemText>` wraps Reka UI's `TagsInputItemText`. It renders the display text and supplies the accessible label for its item. Its optional props are `as`, `asChild`, and `class`.
- `<UITagsInputItemDelete>` wraps Reka UI's `TagsInputItemDelete`. It renders a button with the local cancel icon by default. Provide slot content to replace the icon. Its optional props are `as`, `asChild`, and `class`.
- Every local part accepts `class`. The wrapper merges it with the component's default classes through `cn`. The root uses a border, focus-within ring, secondary tag surface, and destructive `aria-invalid` styles. The parts have no named variants.
- Nest every item and the input directly inside `<UITagsInput>`. `<UITagsInputItemText>` and `<UITagsInputItemDelete>` must be inside their matching `<UITagsInputItem>`.
- The root default slot exposes `modelValue`. Use `v-slot="{ modelValue: tags }"` when the rendered list must follow the root's current array instead of a separately named ref.
- The root `v-model` value is an array of strings, numbers, bigints, or records. `modelValue` also accepts `null` at the Reka prop boundary, but consumers should bind an array such as `ref<string[]>([])`.
- For object values, pass both `convertValue` and `displayValue` when using `<UITagsInputInput>`. `convertValue` turns the input string into the object type. `displayValue` turns each object into visible text. Reka throws if the model contains objects and `convertValue` is missing.
- Use the same value type for `UITagsInputItem` as the root model. Use a stable object field for the Vue `:key` when the tags are objects.
- The root props include `defaultValue`, `modelValue`, `delimiter`, `addOnPaste`, `addOnTab`, `addOnBlur`, `duplicate`, `max`, `convertValue`, `displayValue`, `disabled`, `dir`, `id`, `name`, `required`, `as`, `asChild`, and `class`. `defaultValue` starts uncontrolled state, and `v-model` controls the array.
- `delimiter` defaults to `,`. Typing the delimiter adds the current input value and removes the delimiter from the input. Pass a string or a `RegExp` to support another delimiter or several delimiters.
- `addOnPaste` defaults to `false`. When true, paste is intercepted and split with `delimiter`, so each segment is attempted as a tag. A regular expression delimiter also controls paste splitting.
- Pressing `Enter` adds a non-empty input value. Set `add-on-tab` to add on `Tab`, or set `add-on-blur` to add on blur. A prevented `Enter` or `Tab` event remains available for consumer-controlled behavior.
- A failed add from `Enter`, delimiter typing, or blur leaves the current input text in place. Paste segments are handled directly and are not inserted into the input. The component does not trim tag values. Use a delimiter regular expression that consumes whitespace when pasted values must not retain surrounding spaces.
- `max` limits the number of tags. Its default is `0`, which means unlimited. An attempted add at the limit emits `invalid` and does not change the model.
- `duplicate` defaults to false. A duplicate primitive value emits `invalid`, does not change the model, and marks the root and input with Reka's invalid data state. Set `duplicate` to true to allow repeated values.
- Duplicate checks use JavaScript `includes` for newly converted values. Objects created as fresh values by `convertValue` do not deduplicate by their fields. Use primitive values or return stable objects when duplicate suppression matters.
- The component has no validator prop. The `invalid` event reports rejected additions caused by `max` or duplicate handling. Use the event with external form validation, set `aria-invalid`, and connect an error message with `aria-describedby`.
- The local root styles respond to `aria-invalid`. Reka also exposes `data-invalid` for duplicate rejection. Set `aria-invalid` yourself when an external validator or a max rejection must show the local destructive border.
- `required` and `name` support form submission through Reka's visually hidden form input when the component is used inside a form. `disabled` prevents interaction, disables the nested input and delete buttons, and marks the root and items with `data-disabled`.
- Individual `<UITagsInputItem disabled>` values remain in the model and are skipped by tag keyboard navigation. Their delete button does not remove them.
- The forwarded API has no root `readonly` prop. A native `readonly` attribute on `<UITagsInputInput>` prevents text editing only. It does not disable delete buttons or programmatic model updates. Use root `disabled` for a fully locked composite, or omit the input and delete parts for a read-only presentation.
- `<UITagsInputItemDelete>` removes its item's value on click. There is no edit event or inline edit part. To change a tag, remove it and add a new value, or update the bound array directly.
- The root emits `update:modelValue` with the current array, `addTag` with the successfully added value, `removeTag` with the removed value, and `invalid` with the rejected value. In templates, listen with `@update:model-value`, `@add-tag`, `@remove-tag`, and `@invalid`.
- The input uses the root's `id`, `disabled`, and direction context. Put the accessible label on the input or associate a native `<label>` with the root `id`. Keep `<UITagsInputItemText>` in every item because it supplies the item's `aria-labelledby` target.
- Reka marks the active item with `data-state="active"` and `aria-current`. The item delete button uses the item text as its accessible label and has `tabindex="-1"`; focus stays in the composite's keyboard model.
- With the input caret at position zero, `Backspace` first selects the last enabled tag. On an active tag, `Delete` or `Backspace` removes it and selects an adjacent enabled tag. A disabled tag is skipped.
- With the caret at position zero, `ArrowLeft` and `ArrowRight` move the active tag according to `dir`. `ArrowLeft` selects the last tag from the input in left-to-right mode. `ArrowRight` from the last active tag returns to the input. `Home` selects the first tag, and `End` selects the last tag.
- `ArrowUp` and `ArrowDown` do not move an active tag. Typing a regular key clears the active tag selection. The component skips these navigation rules during IME composition.
- The root supports `as`, `asChild`, `dir`, and other Reka primitive behavior. Use `asChild` only when the replacement element can preserve the composite's focus and accessibility behavior.
- The local wrapper does not export Reka's `TagsInputClear`. Do not use `<UITagsInputClear>`. Add a local wrapper before using that part, or use an explicitly imported Reka primitive in script code when the project allows it.

## Examples

### Basic tags

```vue
<script setup lang="ts">
import { ref } from 'vue'

const tags = ref(['Vue', 'Nuxt'])
</script>

<template>
	<label for="technologies">Technologies</label>
	<UITagsInput id="technologies" v-model="tags">
		<UITagsInputItem v-for="tag in tags" :key="tag" :value="tag">
			<UITagsInputItemText />
			<UITagsInputItemDelete />
		</UITagsInputItem>
		<UITagsInputInput placeholder="Add a technology" />
	</UITagsInput>
</template>
```

### Custom delimiters

```vue
<script setup lang="ts">
import { ref } from 'vue'

const tags = ref<string[]>([])
const delimiter = /[ ,;\t\n\r]+/
</script>

<template>
	<label for="keywords">Keywords</label>
	<UITagsInput id="keywords" v-model="tags" :delimiter="delimiter" add-on-paste>
		<UITagsInputItem v-for="tag in tags" :key="tag" :value="tag">
			<UITagsInputItemText />
			<UITagsInputItemDelete />
		</UITagsInputItem>
		<UITagsInputInput placeholder="Type or paste keywords" />
	</UITagsInput>
</template>
```

### Maximum tags

```vue
<script setup lang="ts">
import { ref } from 'vue'

const tags = ref<string[]>([])
</script>

<template>
	<label for="topics">Topics</label>
	<UITagsInput id="topics" v-model="tags" :max="3">
		<UITagsInputItem v-for="tag in tags" :key="tag" :value="tag">
			<UITagsInputItemText />
			<UITagsInputItemDelete />
		</UITagsInputItem>
		<UITagsInputInput placeholder="Up to three topics" />
	</UITagsInput>
</template>
```

### Validation for a rejected addition

```vue
<script setup lang="ts">
import { ref } from 'vue'

const tags = ref<string[]>([])
const invalidTag = ref<string | null>(null)

function handleInvalid(value: string) {
	invalidTag.value = value
}

function handleAdd() {
	invalidTag.value = null
}
</script>

<template>
	<div>
		<label for="validated-tags">Topics</label>
		<UITagsInput
			id="validated-tags"
			v-model="tags"
			:max="3"
			:aria-invalid="invalidTag !== null"
			@invalid="handleInvalid"
			@add-tag="handleAdd"
		>
			<UITagsInputItem v-for="tag in tags" :key="tag" :value="tag">
				<UITagsInputItemText />
				<UITagsInputItemDelete />
			</UITagsInputItem>
			<UITagsInputInput
				:aria-invalid="invalidTag !== null"
				aria-describedby="tags-error"
				placeholder="Add a topic"
			/>
		</UITagsInput>
		<p v-if="invalidTag !== null" id="tags-error">
			{{ invalidTag }} was not added because the limit is three tags.
		</p>
	</div>
</template>
```

## References

- [Local export](./index.ts)
- [Local root wrapper](./TagsInput.vue)
- [Local input wrapper](./TagsInputInput.vue)
- [Local item wrapper](./TagsInputItem.vue)
- [Local item text wrapper](./TagsInputItemText.vue)
- [Local item delete wrapper](./TagsInputItemDelete.vue)
- [Input](../input/AGENTS.md) for native input conventions.
- [Field](../field/AGENTS.md) for form labels and validation messaging.
- [Combobox](../combobox/AGENTS.md) for listbox composition patterns.
- [shadcn-vue Tags Input documentation](https://shadcn-vue.com/docs/components/tags-input)
- [Reka UI Tags Input documentation](https://reka-ui.com/docs/components/tags-input)
