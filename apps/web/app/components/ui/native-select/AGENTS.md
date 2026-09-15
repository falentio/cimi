# Native Select

Provides a styled native `<select>` while preserving browser select, form, and accessibility behavior.

## Conclusion

Use `<UINativeSelect>` when native browser behavior, mobile pickers, form participation, or low overhead matters. Compose it with `<UINativeSelectOption>` children and wrap related options with `<UINativeSelectOptGroup>`. Use the custom `Select` component when you need a popup, custom trigger, animation, or richer interactions.

## Usage

`shadcn-nuxt` auto-imports the three exported components with the project `UI` prefix. Do not import these components in a template. Import `ref`, helpers, types, icons, and third-party APIs explicitly.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const status = ref('')
</script>

<template>
	<UINativeSelect v-model="status" name="status" aria-label="Status">
		<UINativeSelectOption value="">Select status</UINativeSelectOption>
		<UINativeSelectOption value="todo">Todo</UINativeSelectOption>
		<UINativeSelectOption value="done">Done</UINativeSelectOption>
	</UINativeSelect>
</template>
```

## Meaningful Information

- `index.ts` exports `NativeSelect`, `NativeSelectOption`, and `NativeSelectOptGroup`. Their template tags in this app are `<UINativeSelect>`, `<UINativeSelectOption>`, and `<UINativeSelectOptGroup>`.
- This index has no lowercase helpers or type-only exports. The three exports are components, so Nuxt auto-imports them in templates.
- `<UINativeSelect>` renders a wrapper `<div>` around one native `<select>`. Its default slot supplies the select's `<option>` and `<optgroup>` children.
- Compose the root with `<UINativeSelectOption>` children. Use `<UINativeSelectOptGroup label="...">` to group related options. Put `<UINativeSelectOption>` inside the optgroup.
- `NativeSelect` declares `modelValue`, `class`, and `size`. `modelValue` has the type `AcceptableValue | AcceptableValue[]`. `class` accepts Vue `HTMLAttributes['class']`. `size` accepts only `'sm'` or `'default'` and defaults to `'default'`.
- The local root has no `variant` prop. A `variant` attribute is not a styling API. It falls through to the native `<select>` as an ordinary attribute and does not select a visual variant.
- The root `class` prop styles the wrapper `<div>`, not the native `<select>`. The wrapper uses `data-slot="native-select-wrapper"` and exposes the selected size through `data-size`. The native select uses `data-slot="native-select"`.
- `size="sm"` selects the component's compact visual classes. It does not set the native HTML `size` attribute, because the local component owns that prop. The native `size` listbox behavior is not exposed by this wrapper.
- `NativeSelectOption` declares only `class`, typed as `HTMLAttributes['class']`. Its root is a native `<option>` with `data-slot="native-select-option"`. `value`, `disabled`, and other option attributes fall through to that element. The default slot supplies the visible option text.
- `NativeSelectOptGroup` declares only `class`, typed as `HTMLAttributes['class']`. Its root is a native `<optgroup>` with `data-slot="native-select-optgroup"`. `label`, `disabled`, and other optgroup attributes fall through to that element.
- Option `value` is the submitted value and the value returned by native select events. Browser select controls normally expose it as a string. If an option has no `value`, the browser uses its text content.
- `v-model` binds the root's `modelValue`. The only declared component event is `update:modelValue`, which the component emits when the native select changes. When `modelValue` is absent, the local VueUse binding starts with an empty string.
- Native listeners such as `@change`, `@input`, `@focus`, `@blur`, and keyboard listeners fall through to the underlying `<select>`. Use `v-model` for state and `@change` when you need the native event.
- Pass `multiple` to the root for a native multi-select. Bind an array with `v-model` so Vue tracks the selected options. The browser then applies its native multi-select keyboard and form behavior.
- `disabled` on the root reaches the native `<select>`. The wrapper also lowers its opacity when the select is disabled. `disabled` on an option or optgroup prevents that choice.
- `required` reaches the native `<select>` and enables browser constraint validation. A placeholder option with `value=""` stays invalid until the user selects a non-empty value.
- `name` reaches the native `<select>` and supplies the key used during native form submission. A disabled select is excluded from submission, as with any disabled native form control.
- `id`, `aria-*`, `data-*`, `autocomplete`, and other undeclared attributes reach the native `<select>`. The component keeps `$attrs` off the wrapper and binds them to the select.
- The select participates in native form submit, validation, keyboard navigation, and mobile browser pickers. The component does not add parsing, validation messages, filtering, search, or a custom popup.
- Give the select an accessible name with a native `<label for="...">`, `aria-label`, or `aria-labelledby`. An `id` on `<UINativeSelect>` reaches the select for label association.
- The decorative arrow is rendered by `HugeiconsIcon` and has `aria-hidden="true"`. It does not replace the browser's select semantics or keyboard behavior.
- Set `aria-invalid="true"` when validation reports an error. Connect supporting error text with `aria-describedby` when the form needs a description.
- The component's classes include focus, invalid, disabled, dark-mode, and size styles. Use the `data-slot` hooks or a wrapper class for local styling instead of expecting a `variant` prop.
- Do not use `<UINativeSelect>` for a custom animated menu. Use the app's `Select` component for that interaction, and keep native select behavior when the browser control is the better fit.

## Examples

### Basic select with a reactive value

```vue
<script setup lang="ts">
import { ref } from 'vue'

const fruit = ref('')
const changed = ref(false)
</script>

<template>
	<UINativeSelect v-model="fruit" aria-label="Fruit" @change="changed = true">
		<UINativeSelectOption value="">Select a fruit</UINativeSelectOption>
		<UINativeSelectOption value="apple">Apple</UINativeSelectOption>
		<UINativeSelectOption value="banana">Banana</UINativeSelectOption>
		<UINativeSelectOption value="grapes" disabled>Grapes</UINativeSelectOption>
	</UINativeSelect>
	<p v-if="changed">Selected fruit: {{ fruit }}</p>
</template>
```

### Grouped options

```vue
<template>
	<UINativeSelect aria-label="Department">
		<UINativeSelectOption value="">Select department</UINativeSelectOption>
		<UINativeSelectOptGroup label="Engineering">
			<UINativeSelectOption value="frontend">Frontend</UINativeSelectOption>
			<UINativeSelectOption value="backend">Backend</UINativeSelectOption>
			<UINativeSelectOption value="devops">DevOps</UINativeSelectOption>
		</UINativeSelectOptGroup>
		<UINativeSelectOptGroup label="Sales">
			<UINativeSelectOption value="sales-rep">Sales Rep</UINativeSelectOption>
			<UINativeSelectOption value="account-manager">Account Manager</UINativeSelectOption>
		</UINativeSelectOptGroup>
	</UINativeSelect>
</template>
```

### Required native form field

```vue
<script setup lang="ts">
import { ref } from 'vue'

const country = ref('')
const submitted = ref('')

function submit() {
	submitted.value = country.value
}
</script>

<template>
	<form class="grid max-w-sm gap-2" @submit.prevent="submit">
		<label for="country">Country</label>
		<UINativeSelect
			id="country"
			v-model="country"
			name="country"
			required
			aria-describedby="country-help"
		>
			<UINativeSelectOption value="">Select a country</UINativeSelectOption>
			<UINativeSelectOption value="us">United States</UINativeSelectOption>
			<UINativeSelectOption value="uk">United Kingdom</UINativeSelectOption>
		</UINativeSelect>
		<p id="country-help">Choose the country for this order.</p>
		<button type="submit">Submit</button>
		<p v-if="submitted">Submitted country: {{ submitted }}</p>
	</form>
</template>
```

### Compact and invalid states

```vue
<template>
	<UINativeSelect size="sm" aria-invalid="true" aria-label="Role">
		<UINativeSelectOption value="">Select a role</UINativeSelectOption>
		<UINativeSelectOption value="admin">Admin</UINativeSelectOption>
		<UINativeSelectOption value="editor">Editor</UINativeSelectOption>
	</UINativeSelect>
</template>
```

## References

- [shadcn-vue Native Select documentation](https://shadcn-vue.com/docs/components/native-select)
- [Local implementation](./NativeSelect.vue)
- [Local option implementation](./NativeSelectOption.vue)
- [Local optgroup implementation](./NativeSelectOptGroup.vue)
- [Local export](./index.ts)
- [HTML `<select>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/select)
- [HTML `<option>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/option)
- [HTML `<optgroup>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/optgroup)
- [Vue component `v-model`](https://vuejs.org/guide/components/v-model.html)
