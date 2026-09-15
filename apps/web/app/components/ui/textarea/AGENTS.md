# Textarea

Renders a styled native `<textarea>` for multiline form input.

## Conclusion

Use `<UITextarea>` for multiline text. `shadcn-nuxt` auto-imports the local `Textarea` export with the `UI` prefix, so templates need no component import. The component keeps the native textarea contract and adds shared styling plus `v-model` wiring.

## Usage

```vue
<template>
	<UITextarea placeholder="Type your message here." />
</template>
```

This is the official Textarea usage example adapted to the app's Nuxt auto-import convention.

## Meaningful Information

- `index.ts` exports only `Textarea` from `Textarea.vue`. Use `<UITextarea>` in templates. Import lowercase helpers, refs, icons, and type-only exports explicitly when a consumer needs them.
- The explicit props are:

  | Prop | Type | Default | Meaning |
  | --- | --- | --- | --- |
  | `class` | `HTMLAttributes['class']` | unset | Merges consumer classes with the component classes through `cn`. |
  | `defaultValue` | `string \| number` | unset | Supplies the initial value when `modelValue` is not provided. |
  | `modelValue` | `string \| number` | unset | Holds the value used by `v-model`. |

- `v-model` binds to `modelValue` and listens for `update:modelValue`. The component emits that event with a `string | number` payload. Native textarea input normally produces a string even though the prop type also permits a number.
- `useVModel` configures passive updates and uses `defaultValue` as the initial value. The component does not parse, debounce, validate, submit, or format the value.
- `Textarea.vue` has one root element, a native `<textarea>`. Undeclared attributes fall through to that element. This includes `id`, `name`, `rows`, `placeholder`, `disabled`, `required`, `readonly`, `maxlength`, `aria-*`, and `data-*` attributes.
- The common native attributes have these effects:

  | Attribute | Effect |
  | --- | --- |
  | `rows` | Sets the native preferred row count. The default content-based sizing can override this in browsers that support `field-sizing: content`. |
  | `placeholder` | Shows a hint while the value is empty. It is not an accessible name. |
  | `disabled` | Prevents focus and editing. The browser excludes the control from form submission. The component adds disabled opacity and cursor styles. |
  | `required` | Enables the browser's native constraint validation when the control belongs to a form. |
  | `name` | Supplies the key used for native form submission. A control without `name` contributes no form field value. |

- Other native listeners also fall through. Use `@input` for the native `InputEvent`, or use `@change`, `@focus`, `@blur`, and `@keydown` when those DOM events fit the use case. Use `@update:modelValue` when you need the component model event.
- The component has no slots. Child content between `<UITextarea>` tags does not render. Put initial text in `defaultValue` or `v-model`, and use `placeholder` for a hint.
- The component includes `field-sizing-content`, `min-h-16`, and `w-full`. It can grow with its content through CSS in supporting browsers. It has no JavaScript auto-resize logic and no `autoResize` prop. The browser may fall back to normal textarea sizing on older browsers.
- Content-based sizing can make `rows` ineffective. Use `min-height`, `max-height`, or an explicit height class when the layout needs a bounded size. Avoid a fixed height when content-based growth is the intended behavior.
- The component does not provide validation props or error text. Set `aria-invalid="true"` when validation reports an error. Link help or error text with `aria-describedby`.
- Give each textarea an accessible name. Use `<UILabel for="...">` with a matching `id`, or use `aria-label` or `aria-labelledby` when a visible label is not available. Use `<UIField>` and its label and error parts when the field needs the shared form layout.
- For input groups, use `<UIInputGroupTextarea>` instead of placing `<UITextarea>` directly inside `<UIInputGroup>`. The wrapper adds `data-slot="input-group-control"` and the borderless group styles, then passes textarea attributes, `v-model`, and native events through to `<UITextarea>`.
- Place `<UIInputGroupAddon>` after the textarea. Use `align="block-start"` or `align="block-end"` for a multiline control. The addon click handler searches for an `input`, so clicking text-only addon content does not focus a textarea.
- `<UIInputGroupButton>` always renders as `type="button"`. Use a separate submit button when a grouped textarea belongs to a native form and the action must submit it.

The official Textarea page has Installation and Usage sections. It does not provide API reference tables or sections for props, events, slots, disabled state, forms, validation, accessibility, auto-resize, or input-group integration. Those details come from the local implementation, native textarea behavior, and the official Input Group documentation.

## Examples

### Basic

```vue
<template>
	<UITextarea placeholder="Type your message here." aria-label="Message" />
</template>
```

### Disabled

```vue
<template>
	<UITextarea disabled placeholder="This message cannot be edited." aria-label="Disabled message" />
</template>
```

### Form

```vue
<template>
	<form class="grid w-full max-w-sm gap-2">
		<UILabel for="feedback">Feedback</UILabel>
		<UITextarea
			id="feedback"
			name="feedback"
			rows="4"
			placeholder="Tell us what you think."
			required
		/>
		<button type="submit">Send feedback</button>
	</form>
</template>
```

### Input group

```vue
<template>
	<UIInputGroup class="w-full max-w-md">
		<UIInputGroupTextarea
			id="message"
			name="message"
			placeholder="Enter your message"
			aria-label="Message"
		/>
		<UIInputGroupAddon align="block-end">
			<UIInputGroupText>120 characters left</UIInputGroupText>
			<UIInputGroupButton class="ml-auto" size="sm" variant="default">
				Send
			</UIInputGroupButton>
		</UIInputGroupAddon>
	</UIInputGroup>
</template>
```

## References

- [Official Textarea documentation](https://shadcn-vue.com/docs/components/textarea)
- [Official Input Group documentation](https://shadcn-vue.com/docs/components/input-group)
- [Local export](./index.ts)
- [Local implementation](./Textarea.vue)
- [Input Group](../input-group/AGENTS.md) for grouped textarea behavior
- [Field](../field/AGENTS.md) for labels, descriptions, and errors
- [Label](../label/AGENTS.md) for accessible control names
- [HTML `<textarea>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/textarea)
- [CSS `field-sizing` property](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/field-sizing)
