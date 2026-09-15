# Label

Renders an accessible label associated with a form control.

## Conclusion

Use `<UILabel>` for visible text that names a native or custom form control. Pair its `for` prop with the control's matching `id`, or place the control inside the label. The component renders a styled native `<label>` by default and does not manage control state.

## Usage

```vue
<template>
	<div class="flex items-center gap-2">
		<input id="email" type="email" />
		<UILabel for="email">Email address</UILabel>
	</div>
</template>
```

## Meaningful Information

- `shadcn-nuxt` auto-imports the `Label` export as `<UILabel>` because `apps/web/nuxt.config.ts` sets the `UI` prefix and `@/components/ui` component directory. Do not import the component in a template.
- The local export is `Label` from `apps/web/app/components/ui/label/index.ts`. The implementation is `Label.vue`. The index exports no helper or type for consumers to import.
- The complete explicit prop surface is:

  | Prop | Type | Default | Meaning |
  | --- | --- | --- | --- |
  | `as` | `AsTag \| Component` | `"label"` | Changes the rendered element or Vue component. |
  | `asChild` | `boolean` | `false` | Merges the label props and behavior into one child element or component. |
  | `for` | `string` | unset | Sets the `for` attribute that associates the label with a control id. |
  | `class` | `HTMLAttributes['class']` | unset | Adds classes to the local label styles through `cn`. |

- The default slot is the label content. It accepts text, inline markup, and a nested control. The slot has no slot props and the component has no named slots.
- The default render is one Reka UI `Label` primitive with `data-slot="label"`. That primitive renders a native `<label>` unless `as` or `asChild` changes it.
- Attributes that are not explicit props fall through to the rendered element. Use native and global attributes such as `id`, `title`, `style`, `role`, `aria-*`, and `data-*` when the rendered element needs them.
- Native DOM listeners such as `@click`, `@focus`, and `@blur` fall through to the rendered element. The component declares no custom events.
- The component does not define `v-model`, `modelValue`, `defaultValue`, `disabled`, `value`, or validation props. It emits no component events. Bind state and events to the control itself.
- Use `for` with the exact `id` of the control. Give each control a unique id when a page has more than one instance. The browser then activates the control when the user clicks the label.
- You can omit `for` when the control is nested inside the label. Use one association style for each label.
- Reka UI prevents text selection when the user double-clicks the label. It also supports nested controls through the native label behavior.
- `class` is consumed by the local wrapper and merged with the base classes through `cn`. The base classes are:
  `gap-2 text-sm leading-none font-medium group-data-[disabled=true]:opacity-50 peer-disabled:opacity-50 flex items-center select-none group-data-[disabled=true]:pointer-events-none peer-disabled:cursor-not-allowed`.
- The `peer-disabled:*` classes only change opacity and cursor when a preceding control uses the `peer` class. A label does not disable its associated control.
- Set `as` only when the replacement element or component keeps the required label semantics. A `span` is not a substitute for a native label when the text must name a control.
- Set `asChild` to pass the primitive behavior to one child. The child must accept forwarded attributes and events. Preserve a native `<label>` or equivalent accessible behavior when using this escape hatch.
- Lowercase helpers and type-only exports need explicit imports in templates and scripts. This component has no consumer-facing helper or type export, so normal usage needs no script block.

## Examples

### Pair a label with a control

```vue
<template>
	<div class="grid w-full max-w-sm items-center gap-1.5">
		<UILabel for="username">Username</UILabel>
		<input id="username" type="text" autocomplete="username" />
	</div>
</template>
```

### Wrap the control

```vue
<template>
	<UILabel>
		<input type="checkbox" />
		Subscribe to updates
	</UILabel>
</template>
```

### Pass native attributes and local classes

```vue
<template>
	<UILabel
		id="email-label"
		for="email"
		class="text-base"
		data-testid="email-label"
	>
		Email address
	</UILabel>
	<input id="email" type="email" aria-labelledby="email-label" />
</template>
```

### Compose onto one native child with `asChild`

```vue
<template>
	<UILabel as-child>
		<label for="terms" class="font-semibold">Accept terms and conditions</label>
	</UILabel>
	<input id="terms" type="checkbox" />
</template>
```

## References

- [Local implementation](./Label.vue)
- [Local export](./index.ts)
- [Input](../input/AGENTS.md) for a styled text control to label.
- [Field](../field/AGENTS.md) for composing labels, controls, descriptions, and errors.
- [shadcn-vue Label documentation](https://shadcn-vue.com/docs/components/label)
- [Reka UI Label documentation](https://reka-ui.com/docs/components/label)
- [Reka UI composition guide](https://reka-ui.com/docs/guides/composition)
- [HTML `<label>` element](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/label)
