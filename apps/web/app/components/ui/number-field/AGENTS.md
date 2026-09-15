# Number Field

Provides a styled numeric field with typed values, locale-aware formatting, keyboard input, and increment or decrement controls.

## Conclusion

Use `<UINumberField>` as the root and compose `<UINumberFieldContent>` with `<UINumberFieldInput>` and any needed stepper controls. Use `v-model` with `number | null` state for controlled values, or `default-value` for an uncontrolled initial value. Add a visible `<UILabel>` with a matching `for` and `id` when the field needs a label.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'

const age = ref<number | null>(18)
</script>

<template>
  <UINumberField id="age" v-model="age" :min="0" :max="120">
    <UILabel for="age">Age</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement />
      <UINumberFieldInput />
      <UINumberFieldIncrement />
    </UINumberFieldContent>
  </UINumberField>
</template>
```

## Meaningful Information

### Exports and composition

- `apps/web/app/components/ui/number-field/index.ts` exports exactly five components.

  | Export                 | Auto-imported template tag | Role                                                                                     |
  | ---------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
  | `NumberField`          | `<UINumberField>`          | Root that owns value state, constraints, formatting, form behavior, and emitted updates. |
  | `NumberFieldContent`   | `<UINumberFieldContent>`   | Relative layout wrapper for the input and stepper controls.                              |
  | `NumberFieldInput`     | `<UINumberFieldInput>`     | Styled Reka UI input that displays and edits the number.                                 |
  | `NumberFieldIncrement` | `<UINumberFieldIncrement>` | Button that increases the value.                                                         |
  | `NumberFieldDecrement` | `<UINumberFieldDecrement>` | Button that decreases the value.                                                         |

- `shadcn-nuxt` auto-imports these tags from `@/components/ui` with the `UI` prefix configured in `apps/web/nuxt.config.ts`. Do not import these components in a template.
- The standard composition is `<UINumberField>` containing a label and `<UINumberFieldContent>`. Put `<UINumberFieldDecrement>`, `<UINumberFieldInput>`, and `<UINumberFieldIncrement>` inside the content wrapper in that order.
- The root and input provide the field. The decrement and increment parts are optional. Use `<UINumberFieldContent>` whenever the local absolute-positioned controls are present because its styles reserve space for their `data-slot` attributes.
- `<UINumberFieldContent>` has only a `class` prop and renders a `div`. Its default slot renders the field parts.
- `<UINumberFieldInput>` has an explicit `class` prop and renders the Reka UI input. Native input attributes such as `placeholder`, `autocomplete`, `aria-label`, `aria-describedby`, and `data-*` can be passed to it.
- The input and content classes are merged with the local styles through `cn`. The root also merges its `class` prop with `grid gap-1.5`.
- The stepper components forward Reka UI props and merge `class` with their local absolute-positioning styles. Each component has a default slot for replacement content.
- Increment defaults to `PlusSignIcon`. Decrement defaults to `MinusSignIcon`. Pass slot content when the button needs a different icon or text.
- Lowercase helpers and type-only exports need explicit imports. This index has no lowercase helper or consumer-facing type export. Import `ref` or other script dependencies explicitly.

### Root props

`<UINumberField>` forwards `NumberFieldRootProps` and `NumberFieldRootEmits` from Reka UI. The local component adds `class`.

| Template prop          | Type                       | Default | Meaning                                                                                                                    |
| ---------------------- | -------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `as`                   | `AsTag \| Component`       | `div`   | Changes the root element or component.                                                                                     |
| `as-child`             | `boolean`                  | `false` | Merges root behavior into one child. Use this only when the child forwards attributes and events.                          |
| `default-value`        | `number`                   | unset   | Sets the initial value for uncontrolled usage.                                                                             |
| `model-value`          | `number \| null`           | unset   | Supplies the controlled numeric value used by `v-model`.                                                                   |
| `min`                  | `number`                   | unset   | Sets the smallest allowed value.                                                                                           |
| `max`                  | `number`                   | unset   | Sets the largest allowed value.                                                                                            |
| `step`                 | `number`                   | `1`     | Sets the amount added or subtracted per stepper tick and keyboard increment.                                               |
| `step-snapping`        | `boolean`                  | `true`  | Snaps values to the nearest step increment when true. Set it to false to preserve values that are not aligned to the step. |
| `format-options`       | `Intl.NumberFormatOptions` | unset   | Controls displayed formatting and the characters the user can type.                                                        |
| `locale`               | `string`                   | unset   | Selects the locale used for formatting and currencies.                                                                     |
| `disabled`             | `boolean`                  | `false` | Prevents interaction with the number field.                                                                                |
| `readonly`             | `boolean`                  | `false` | Makes the number field read-only.                                                                                          |
| `required`             | `boolean`                  | `false` | Requires a value before the owning form can submit.                                                                        |
| `id`                   | `string`                   | unset   | Sets the field id used by its label association.                                                                           |
| `name`                 | `string`                   | unset   | Supplies the form name used for name and value submission.                                                                 |
| `disable-wheel-change` | `boolean`                  | `false` | Prevents wheel scrolling from changing the value.                                                                          |
| `invert-wheel-change`  | `boolean`                  | `false` | Reverses the direction of wheel changes.                                                                                   |
| `focus-on-change`      | `boolean`                  | `true`  | Focuses the input when the value changes.                                                                                  |
| `class`                | `HTMLAttributes['class']`  | unset   | Adds classes to the styled root.                                                                                           |

The `as` and `as-child` props are also available on the input and stepper parts through their Reka UI primitives. `disabled` is available on the increment and decrement parts so one control can be disabled independently. The content wrapper accepts only `class`.

### Values, constraints, and formatting

- `v-model` uses a numeric value. Declare controlled state as `ref<number | null>` and bind it with `v-model`. Valid changes emit `update:modelValue` with a number payload.
- The root supports both controlled and uncontrolled usage. Choose `v-model` when the parent owns state. Choose `default-value` when the field owns its initial state.
- `null` represents an empty controlled value. A root scoped slot exposes `modelValue` as `number | undefined`, along with `textValue` as `string` and `readonly` as `boolean`.
- `min` and `max` constrain the field. They also provide the targets for the `Home` and `End` keys when the corresponding bound exists.
- `step` defaults to `1`. It controls increment and decrement buttons, arrow keys, and page keys.
- `step-snapping` defaults to `true`. Set `:step-snapping="false"` when the field must retain a numeric value that does not land on a step boundary.
- `format-options` accepts the options supported by `Intl.NumberFormat`. It can set fraction digits, sign display, grouping, percent style, currency style, and other number formatting rules.
- Formatting changes the displayed text while the model remains numeric. Formatting also affects which characters the input accepts.
- `locale` controls locale-specific separators, numbering systems, and currency presentation. Pass it on the root, not on the input.
- Percentage values use fractions in the model. For example, `0.05` displays as `5%` with `style: 'percent'`. Set `step` to `0.01` for percentage increments.
- Currency formatting requires a `currency` code in `format-options`. The field does not infer a currency or let the user change it through the number input. Use a separate select when currency choice is part of the form.

### Events and form behavior

- The root declares `update:modelValue`. Listen with `@update:model-value` when code must react to every numeric change.
- Stepper clicks, held stepper buttons, keyboard changes, and enabled wheel changes use the same model update event.
- The stepper parts declare no separate value event. Their `disabled` prop controls the individual button.
- Native input attributes and listeners belong on `<UINumberFieldInput>`. Use listeners such as `@blur`, `@focus`, `@input`, and `@change` there when the native input event is needed.
- Pass `id` to the root and the same value to `<UILabel for="...">`. This is the documented label association pattern.
- Pass `name` to the root when the value must submit with a form. Reka UI adds form support input behavior when the root is inside a form.
- `required` marks the field as required for form submission. It does not replace application-level validation.
- `disabled` prevents user interaction. A disabled field does not participate in normal browser form submission.
- `readonly` keeps the field read-only without using the disabled state. The root scoped slot exposes the read-only state when custom content needs it.

### Keyboard and accessibility

- Reka UI implements the WAI-ARIA spinbutton pattern. Keep the input's accessible name connected to a visible label or provide an `aria-label` or `aria-labelledby`.
- `ArrowUp` increases the value by `step`.
- `ArrowDown` decreases the value by `step`.
- `PageUp` increases the value by ten times `step`.
- `PageDown` decreases the value by ten times `step`.
- `Home` sets the value to `min` when `min` is provided.
- `End` sets the value to `max` when `max` is provided.
- The stepper buttons support holding the button to repeat changes. The field also supports wheel changes unless `disable-wheel-change` is true.
- Use unique `id` values when a page contains more than one number field. Connect descriptions and errors with `aria-describedby` on `<UINumberFieldInput>`.

### Gotchas

- Use `v-model` without `v-model.number`. This component already emits numbers, so Vue's string-to-number modifier is unnecessary.
- Do not put `format-options` on `<UINumberFieldInput>`. Formatting is a root prop because the root owns parsing and value state.
- Use a fractional `step` with percent formatting. A default step of `1` would change a percent value by 100 percentage points.
- Include both `<UINumberFieldInput>` and `<UINumberFieldContent>` in the standard layout. The local button positioning and input padding depend on the content wrapper and its `data-slot` children.
- The local increment and decrement components render their default icons. Their slots replace those icons rather than adding a second control.
- `min` and `max` are number values, not formatted strings. Supply the underlying numeric value even when the display uses a locale, percent, or currency format.

## Examples

### Uncontrolled integer

```vue
<template>
  <UINumberField id="quantity" :default-value="1" :min="1" :max="99">
    <UILabel for="quantity">Quantity</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement />
      <UINumberFieldInput />
      <UINumberFieldIncrement />
    </UINumberFieldContent>
  </UINumberField>
</template>
```

### Controlled value and update event

```vue
<script setup lang="ts">
import { ref } from 'vue'

const payment = ref<number | null>(10)
const lastPayment = ref<number | null>(payment.value)
</script>

<template>
  <UINumberField
    id="payment"
    v-model="payment"
    :min="10"
    :max="5000"
    @update:model-value="lastPayment = $event"
  >
    <UILabel for="payment">Payment</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement />
      <UINumberFieldInput aria-describedby="payment-help" />
      <UINumberFieldIncrement />
    </UINumberFieldContent>
  </UINumberField>
  <p id="payment-help">Last changed value {{ lastPayment }}</p>
</template>
```

### Percentage formatting

```vue
<template>
  <UINumberField
    id="percent"
    :default-value="0.05"
    :step="0.01"
    :format-options="{ style: 'percent' }"
  >
    <UILabel for="percent">Percent</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement />
      <UINumberFieldInput />
      <UINumberFieldIncrement />
    </UINumberFieldContent>
  </UINumberField>
</template>
```

### Currency formatting with a locale

```vue
<template>
  <UINumberField
    id="balance"
    locale="de-DE"
    :default-value="1500"
    :format-options="{
      style: 'currency',
      currency: 'EUR',
      currencyDisplay: 'code',
      currencySign: 'accounting',
    }"
  >
    <UILabel for="balance">Balance</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement />
      <UINumberFieldInput />
      <UINumberFieldIncrement />
    </UINumberFieldContent>
  </UINumberField>
</template>
```

### Custom stepper content

```vue
<template>
  <UINumberField id="seats" :default-value="2" :min="1">
    <UILabel for="seats">Seats</UILabel>
    <UINumberFieldContent>
      <UINumberFieldDecrement aria-label="Remove a seat">-</UINumberFieldDecrement>
      <UINumberFieldInput />
      <UINumberFieldIncrement aria-label="Add a seat">+</UINumberFieldIncrement>
    </UINumberFieldContent>
  </UINumberField>
</template>
```

## References

- [Local export](./index.ts)
- [Root implementation](./NumberField.vue)
- [Content implementation](./NumberFieldContent.vue)
- [Input implementation](./NumberFieldInput.vue)
- [Increment implementation](./NumberFieldIncrement.vue)
- [Decrement implementation](./NumberFieldDecrement.vue)
- [Label](../label/AGENTS.md) for visible control labels.
- [shadcn-vue Number Field documentation](https://shadcn-vue.com/docs/components/number-field)
- [Reka UI Number Field documentation](https://reka-ui.com/docs/components/number-field)
- [WAI-ARIA spinbutton pattern](https://www.w3.org/WAI/ARIA/apg/patterns/spinbutton)
- [Vue component `v-model` guide](https://vuejs.org/guide/components/v-model.html)
- [`Intl.NumberFormat` reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
