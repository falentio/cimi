# Input Group

`input-group` composes a single-line input or textarea with aligned text, icons, buttons, labels, or other actions.

## Conclusion

Use `<UIInputGroup>` as the wrapper. Use `<UIInputGroupInput>` for single-line controls and `<UIInputGroupTextarea>` for multiline controls. Place addons after the control for the component's focus navigation behavior. Use `inline-start` or `inline-end` for inputs, and `block-start` or `block-end` for textareas.

## Usage

```vue
<template>
	<UIInputGroup>
		<UIInputGroupInput placeholder="Search..." aria-label="Search" />
		<UIInputGroupAddon>
			Search
		</UIInputGroupAddon>
		<UIInputGroupAddon align="inline-end">
			<UIInputGroupButton>Submit</UIInputGroupButton>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

## Meaningful Information

- `shadcn-nuxt` auto-imports the local exports with the `UI` prefix. Use component tags such as `<UIInputGroup>` without component imports in templates. Import refs, helpers, types, icons, and third-party APIs explicitly.
- The local exports are `InputGroup`, `InputGroupAddon`, `InputGroupButton`, `InputGroupInput`, `InputGroupText`, and `InputGroupTextarea` from `index.ts`.
- `<UIInputGroup>` renders a `div` with `role="group"`, `data-slot="input-group"`, and an optional `class` prop. It accepts `class?: HTMLAttributes['class']` and has a default slot.
- `<UIInputGroupAddon>` renders a `div` with `role="group"`, `data-slot="input-group-addon"`, and `data-align`. It accepts `align` and `class` props and has a default slot.
- `align` values are `inline-start`, `inline-end`, `block-start`, and `block-end`. The default is `inline-start`.
- `inline-start` places the addon first and gives it start padding. `inline-end` places it last and gives it end padding. `block-start` places a full-width addon above the control. `block-end` places a full-width addon below the control.
- Put an addon after the input or textarea. The addon click handler focuses the first descendant input unless the click came from a button. This placement also lets the group apply its focus styles correctly.
- The addon click handler queries only for an `input`. Clicking a text-only addon beside `<UIInputGroupTextarea>` does not focus the textarea.
- Use inline alignment with `<UIInputGroupInput>`. Use block alignment with `<UIInputGroupTextarea>`. The wrapper switches to an auto-height column layout when it finds a block-aligned addon or a textarea.
- `<UIInputGroupButton>` wraps the local `Button` component. It always passes `type="button"`, accepts `variant`, `size`, and `class`, and renders its default slot.
- `InputGroupButton` `variant` values are `default`, `destructive`, `outline`, `secondary`, `ghost`, and `link`. The default is `ghost`.
- `InputGroupButton` `size` values are `xs`, `sm`, `icon-xs`, and `icon-sm`. The default is `xs`. Use an icon size for icon-only actions and add `aria-label` or visible text for an accessible name.
- `<UIInputGroupInput>` wraps `<UIInput>` with transparent, borderless group-control styles and `data-slot="input-group-control"`. It accepts `class` and passes other attributes to the native input through `<UIInput>`.
- `<UIInputGroupTextarea>` wraps `<UITextarea>` with transparent, borderless group-control styles and `data-slot="input-group-control"`. It accepts `class` and passes other attributes to the native textarea through `<UITextarea>`.
- The input and textarea wrappers support `modelValue?: string | number`, `defaultValue?: string | number`, and the `update:modelValue` event through their underlying components. Use `v-model` for reactive values. Native events such as `@input`, `@change`, `@focus`, `@blur`, and `@keydown` pass through to the underlying control.
- `<UIInputGroupText>` renders a styled `span` with a default slot and an optional `class` prop. Use it for non-interactive text such as a currency symbol, URL prefix, suffix, or character count.
- Add icons, text, buttons, labels, tooltips, dropdown triggers, separators, or other content inside an addon. An addon supports multiple `<UIInputGroupButton>` children.
- The group reacts to descendant `data-slot="input-group-control"` focus, descendant `aria-invalid="true"`, and disabled controls. Set `aria-invalid="true"` on the input or textarea when validation fails.
- Give every control an accessible name. Use a visible label with a matching `for` and `id`, or use `aria-label` or `aria-labelledby` when the label is not visible. Give icon-only buttons an `aria-label` and a `title` when a browser tooltip helps discoverability.
- For custom controls, add `data-slot="input-group-control"` to the control. The group then provides focus-state handling, but it does not apply input or textarea styles. Add the custom control's own styles.
- Use `class` for local layout adjustments such as `!pl-1`, `ml-auto`, `border-t`, or `border-b`. The component styles already remove the inner control border and focus ring, so replacing those styles can break the grouped focus treatment.
- The addon is a `div` with `role="group"`, not a label. Use `<UILabel for="...">` inside an addon when the addon text labels the control.
- The official examples use icon imports from `@lucide/vue`, but icons are not auto-imported. Import the icon component explicitly and place it in the addon or button slot.
- The official page documents installation, usage, icon, text, button, tooltip, textarea, spinner, label, dropdown, button group, custom input, and API reference examples. It does not provide a dedicated `v-model` or event section. Those details come from the local `Input.vue` and `Textarea.vue` implementations.

## Examples

### Text prefix and suffix

```vue
<template>
	<UIInputGroup>
		<UIInputGroupInput placeholder="0.00" aria-label="Amount" />
		<UIInputGroupAddon>
			<UIInputGroupText>$</UIInputGroupText>
		</UIInputGroupAddon>
		<UIInputGroupAddon align="inline-end">
			<UIInputGroupText>USD</UIInputGroupText>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

### Reactive input

```vue
<script setup lang="ts">
import { ref } from 'vue'

const query = ref('')
</script>

<template>
	<UIInputGroup>
		<UIInputGroupInput v-model="query" placeholder="Search..." aria-label="Search" />
		<UIInputGroupAddon align="inline-end">
			<UIInputGroupButton size="sm" @click="query = ''">
				Clear
			</UIInputGroupButton>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

### Textarea with block-end actions

```vue
<template>
	<UIInputGroup>
		<UIInputGroupTextarea placeholder="Enter your message" aria-label="Message" />
		<UIInputGroupAddon align="block-end">
			<UIInputGroupText>120 characters left</UIInputGroupText>
			<UIInputGroupButton class="ml-auto" size="sm" variant="default">
				Send
			</UIInputGroupButton>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

### Icon button

```vue
<script setup lang="ts">
import { CopyIcon } from '@lucide/vue'
</script>

<template>
	<UIInputGroup>
		<UIInputGroupInput value="https://example.com" readonly aria-label="URL" />
		<UIInputGroupAddon align="inline-end">
			<UIInputGroupButton size="icon-xs" aria-label="Copy URL" title="Copy URL">
				<CopyIcon />
			</UIInputGroupButton>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

### Label

```vue
<template>
	<UIInputGroup>
		<UIInputGroupInput id="email" type="email" placeholder="shadcn" />
		<UIInputGroupAddon>
			<UILabel for="email">@</UILabel>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

## References

- [Official Input Group documentation](https://shadcn-vue.com/docs/components/input-group)
- [Local exports](./index.ts)
- [InputGroup implementation](./InputGroup.vue)
- [InputGroupAddon implementation](./InputGroupAddon.vue)
- [InputGroupButton implementation](./InputGroupButton.vue)
- [InputGroupInput implementation](./InputGroupInput.vue)
- [InputGroupText implementation](./InputGroupText.vue)
- [InputGroupTextarea implementation](./InputGroupTextarea.vue)
- [Input](../input/AGENTS.md) for the underlying single-line control
- [Button](../button/AGENTS.md) for button variants and behavior
