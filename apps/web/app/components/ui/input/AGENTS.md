# Input

Displays a styled native form input for single-line text, numeric, email, file, and other HTML input values.

## Conclusion

Use `<UIInput>` for a single-line form control that needs the app's shared input styling. It renders one native `<input>` element, accepts native input attributes, and supports `v-model` through a typed `modelValue` prop. Pair it with `<UILabel>` when the field needs a visible label.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'

const email = ref('')
</script>

<template>
	<UIInput v-model="email" type="email" placeholder="Email" />
</template>
```

## Meaningful Information

- `shadcn-nuxt` auto-imports the exported `Input` component as `<UIInput>`. Do not import the component in a template. Import `ref`, helpers, types, icons, and third-party APIs explicitly.
- The local export is `Input` from `apps/web/app/components/ui/input/index.ts`. Its implementation is `Input.vue`.
- The component renders a single native `<input>` element. It has no child components and no slots. Content placed between the component tags has nowhere to render.
- Explicit props are `defaultValue?: string | number`, `modelValue?: string | number`, and `class?: HTMLAttributes['class']`.
- `modelValue` is the controlled value for `v-model`. The component emits `update:modelValue` with a `string | number` payload.
- `defaultValue` supplies the initial value when `modelValue` is not provided. Use `v-model` for reactive form state.
- The `class` prop is merged with the component classes through the shared `cn` helper. Use it for width, spacing, or local visual changes.
- Other attributes fall through to the native `<input>` because the component has one root element. This includes `id`, `name`, `type`, `placeholder`, `value`, `disabled`, `required`, `readonly`, `min`, `max`, `step`, `pattern`, `autocomplete`, `accept`, `multiple`, `aria-*`, and `data-*` attributes.
- The docs API uses the same native input surface. The official page documents `type`, `placeholder`, `id`, `disabled`, and `class` through examples rather than a formal props table.
- Native listeners such as `@input`, `@change`, `@focus`, `@blur`, and `@keydown` fall through to the input. The declared component event is `update:modelValue`.
- Use `v-model` for ordinary text input. Use `v-model.number` when the consumer needs Vue to coerce a numeric value. Native input values arrive as strings unless Vue or another boundary converts them.
- Set `type` explicitly when the browser needs input-specific behavior. Common values include `text`, `email`, `password`, `number`, `search`, `tel`, `url`, `date`, and `file`.
- A file input still uses the native browser file picker. Use `@change` and read the selected files from the event target. Do not expect `v-model` to provide a `FileList`.
- The input is full width with `w-full`, has a minimum width of zero, and uses the app's border, focus ring, placeholder, invalid, and disabled tokens. Pass `class` to change layout without replacing the component.
- Disabled inputs receive disabled styling, `pointer-events-none`, and `cursor-not-allowed`. The browser also removes them from normal form submission and keyboard interaction.
- Invalid styling activates from `aria-invalid`. Set `aria-invalid="true"` when validation reports an error, and connect the error text with `aria-describedby`.
- A native `<input>` needs an accessible name. Use `<UILabel for="...">` with a matching `id`, or provide an `aria-label` or `aria-labelledby` when a visible label is not possible.
- The component uses `useVModel` from `@vueuse/core` with passive updates and `defaultValue`. It does not add validation, parsing, masking, debouncing, form submission, or error messaging.
- The component does not use a Reka UI primitive. It composes VueUse, the native HTML input, and the local `cn` class helper.
- Do not pass children, invent component-specific props, or rely on an undocumented slot. Use native input attributes for browser behavior.

## Examples

### Default

```vue
<template>
	<UIInput type="email" placeholder="Email" />
</template>
```

### File input with a label

```vue
<template>
	<div class="grid w-full max-w-sm items-center gap-1.5">
		<UILabel for="picture">Picture</UILabel>
		<UIInput id="picture" type="file" />
	</div>
</template>
```

### Disabled

```vue
<template>
	<UIInput disabled type="email" placeholder="Email" />
</template>
```

### With a label

```vue
<template>
	<div class="grid w-full max-w-sm items-center gap-1.5">
		<UILabel for="email">Email</UILabel>
		<UIInput id="email" type="email" placeholder="Email" />
	</div>
</template>
```

### With a button

```vue
<template>
	<form class="flex w-full max-w-sm items-center space-x-2">
		<UIInput type="email" placeholder="Email" />
		<UIButton type="submit">Subscribe</UIButton>
	</form>
</template>
```

### Reactive value and native event

```vue
<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')
const touched = ref(false)
</script>

<template>
	<UIInput
		v-model="query"
		aria-label="Search"
		@blur="touched = true"
	/>
	<p v-if="touched">Searching for {{ query }}</p>
</template>
```

## References

- [shadcn-vue Input documentation](https://shadcn-vue.com/docs/components/input)
- [Local implementation](./Input.vue)
- [Local export](./index.ts)
- [HTML `<input>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input)
- [Vue `v-model` guide](https://vuejs.org/guide/components/v-model.html)
