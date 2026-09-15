# Pin Input

Provides individually focusable, styled inputs for short text or numeric PINs.

## Conclusion

Use `<UIPinInput>` for a PIN made of separate character inputs. Compose it with `<UIPinInputGroup>`, `<UIPinInputSlot>`, and optional `<UIPinInputSeparator>` children. The number of slots sets the PIN length because this component has no `length` prop. The `v-model` value is an array, not one string. The local root defaults `otp` to `true`.

The current shadcn-vue documentation marks Pin Input as deprecated. Prefer [`../input-otp/AGENTS.md`](../input-otp/AGENTS.md) for new one-time-password fields unless the separate-input behavior or the array value is required.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'

const pin = ref<string[]>([])
</script>

<template>
  <label for="account-pin">Account PIN</label>
  <UIPinInput id="account-pin" v-model="pin" :required="true">
    <UIPinInputGroup>
      <UIPinInputSlot :index="0" />
      <UIPinInputSlot :index="1" />
      <UIPinInputSlot :index="2" />
      <UIPinInputSlot :index="3" />
    </UIPinInputGroup>
  </UIPinInput>
</template>
```

## Meaningful Information

### Exports and auto-imports

- `index.ts` exports `PinInput`, `PinInputGroup`, `PinInputSlot`, and `PinInputSeparator`.
- `shadcn-nuxt` auto-imports these exports with the project `UI` prefix. Use `<UIPinInput>`, `<UIPinInputGroup>`, `<UIPinInputSlot>`, and `<UIPinInputSeparator>` in templates.
- Do not import these four components in a template. Import Vue refs, lower-case helpers, icons, third-party APIs, and types explicitly in `<script setup>`.
- The local index does not re-export Reka UI types or helpers. `PinInputRootProps`, `PinInputRootEmits`, and `PinInputInputProps` are implementation imports inside the wrappers.

### Composition

- Put every `<UIPinInputSlot>` under one `<UIPinInput>` root. The slot reads its value and behavior from the nearest Reka UI root context.
- Use `<UIPinInputGroup>` as an optional layout wrapper for consecutive slots. Groups do not add input state.
- Put `<UIPinInputSeparator>` between groups. Separators do not count toward the PIN length.
- Give each slot a zero-based `index`. Keep the indices consecutive and in DOM order, starting at `0`, so model positions and keyboard navigation agree.
- Render one slot for every character in the PIN. A four-slot field has indices `0` through `3`.
- The root renders the slotted groups and a visually hidden form input. Each slot renders one native input.
- `UIPinInputGroup` and `UIPinInputSeparator` wrap Reka UI `Primitive`. `UIPinInputSlot` wraps Reka UI `PinInputInput`.
- The local root does not forward Reka UI's root slot props. Its default slot receives no `modelValue` slot prop.
- The root and each slot expose `data-complete` when every rendered slot has a value. The root and each disabled slot expose `data-disabled` while disabled.

### Root props and value

`UIPinInput` uses the generic `Type extends 'text' | 'number'` with `'text'` as the default. The generic controls the array element type.

| Prop           | Type or default                                                           | Behavior                                                                                                                 |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `modelValue`   | `string[] \| null` for text, `(number \| undefined)[] \| null` for number | Controlled value for `v-model`. The array position matches the slot `index`.                                             |
| `defaultValue` | `string[]` for text, `(number \| undefined)[]` for number                 | Initial value for an uncontrolled field.                                                                                 |
| `type`         | `'text' \| 'number'`, default `'text'`                                    | Selects text mode or numeric mode. Numeric mode filters non-digits and emits numbers.                                    |
| `placeholder`  | `string`, default `''`                                                    | Placeholder character for empty slots. The focused empty slot hides its placeholder while it is active.                  |
| `mask`         | `boolean`, default false                                                  | Uses password inputs for the visible slots. It does not change the `v-model` or form value.                              |
| `otp`          | `boolean`, local default `true`                                           | Enables one-time-code autocomplete and mobile OTP detection. It also prevents focus from skipping an earlier empty slot. |
| `disabled`     | `boolean`                                                                 | Prevents interaction with the root and its slots. The hidden form input is disabled too.                                 |
| `required`     | `boolean`                                                                 | Marks the hidden form input as required. Use it for native form validation.                                              |
| `name`         | `string`                                                                  | Sets the name of the hidden form input used for form submission.                                                         |
| `id`           | `string`                                                                  | Sets the id of the hidden form input. A label can target this id.                                                        |
| `dir`          | `'ltr' \| 'rtl'`                                                          | Sets the reading direction used by horizontal keyboard navigation.                                                       |
| `class`        | `HTMLAttributes['class']`                                                 | Merges into the local root container.                                                                                    |
| `as`           | `AsTag \| Component`                                                      | Changes the element rendered by the Reka UI root primitive.                                                              |
| `asChild`      | `boolean`                                                                 | Composes the root primitive with a child element.                                                                        |

There is no `length` prop. The number of mounted `<UIPinInputSlot>` components determines the input count and the completion condition. The model is not guaranteed to contain one value for every empty position while the field is incomplete.

Text mode uses `string[]`. Numeric mode uses `(number | undefined)[]`, and numeric `0` is a valid value. A cleared numeric position is `undefined`. Use an explicitly typed ref when TypeScript cannot infer the generic from the template.

The root accepts the Reka UI form props and native attributes that fall through to the root primitive. The visible slots receive the input behavior from `PinInputInput`. Use `v-model` or `defaultValue` instead of a native `value` attribute.

### Events

`UIPinInput` declares two root events.

| Event               | Payload                                                              | Behavior                                                                                                                                 |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `update:modelValue` | `string[]` in text mode or `(number \| undefined)[]` in numeric mode | Fires when a slot value changes and drives `v-model`.                                                                                    |
| `complete`          | `string[]` in text mode or `(number \| undefined)[]` in numeric mode | Fires after the current model satisfies every rendered slot. It reports that the PIN is filled, not that the PIN is valid on the server. |

The visible slots handle native `input`, `keydown`, `focus`, `blur`, `paste`, and composition events internally. Use the root value events for model changes.

### Child props and slots

- `<UIPinInputGroup>` accepts `class`, `as`, and `asChild`. Its default slot has no slot props.
- `<UIPinInputSlot>` requires `index: number`. It also accepts `disabled`, `class`, `as`, and `asChild`. Leave it as an input unless replacing the primitive element is intentional.
- `<UIPinInputSlot>` has no useful content slot because it renders a native input. Put visible text outside the slot.
- `<UIPinInputSeparator>` accepts Reka UI `PrimitiveProps` and a default slot. Its default content is the Hugeicons `MinusSignIcon`. Custom slot content replaces the icon.
- The separator has no explicit local `role`. Pass `aria-hidden="true"` when it is decorative.

### Keyboard behavior

- Typing one character updates that slot and focuses the next slot.
- `ArrowLeft` focuses the previous slot. `ArrowRight` focuses the next slot. `Home` focuses the first slot. `End` focuses the last slot.
- `Backspace` clears the current value. If the current slot is empty, it focuses the previous slot and clears that value.
- `Delete` clears the current slot without moving focus.
- Pasting text fills from the first slot when the pasted text has at least as many characters as the field. Otherwise, it fills from the focused slot. Numeric mode applies this rule after removing non-digits.
- Numeric mode removes non-digit characters before it fills slots and stores each remaining character as a number.
- In OTP mode, focusing a later slot while an earlier slot is empty redirects focus to the first empty earlier slot.
- `dir="rtl"` changes the direction used for horizontal arrow navigation.

### Accessibility

- Every `<UIPinInputSlot>` renders a real input. Reka UI adds an automatic label in the form `pin input N of M` to each slot.
- The root adds one visually hidden native input with `tabindex="-1"`. It joins the model array into one form value and receives `id`, `name`, `required`, and root `disabled` state.
- Pair `id` with a native `<label for="...">` when the field needs a visible name. The hidden input forwards focus to the first visible slot when the label is activated.
- Keep the slot inputs as the focusable controls. Do not add competing roles or extra `tabindex` values to the slot markup.
- Connect instructions and validation text to the actual input controls in the surrounding form. Test any custom `aria-*` placement because root attributes target the root primitive while each slot owns its own native input label.
- Mark a visual separator with `aria-hidden="true"` unless its meaning must be exposed to assistive technology.
- `disabled` prevents keyboard and pointer interaction. `required` validates the combined hidden form value rather than each visible slot separately.

### Gotchas

- The current shadcn-vue Pin Input page is deprecated and does not provide the older page's complete API examples. Reka UI is the behavior reference, and Input OTP is the preferred replacement for new OTP work.
- The value is an array. Do not concatenate or compare it as a string until the application needs a transport value.
- The value can be shorter than the slot count while incomplete. Clearing a numeric slot sets its position to `undefined`, so code that reads numeric values must preserve slot positions.
- Keep slot indices aligned with DOM order. The model uses `index`, while keyboard navigation follows the mounted input order.
- `type="number"` changes the model to `(number | undefined)[]`. It does not render native number inputs. The primitive uses text inputs with numeric input mode and a digit pattern.
- The local wrapper defaults `otp` to `true`, even though the Reka UI prop is opt-in in its example. Set `:otp="false"` when the field is not an OTP field.
- `mask` hides characters in the visible inputs only. The model and the hidden form input still contain the actual PIN.
- `complete` means that every rendered slot has a value. It does not authenticate the PIN, and a controlled model update can trigger it without keyboard input.
- A custom root slot cannot read `modelValue` because the local wrapper does not expose Reka UI's root slot props.
- A separator's default minus icon is decorative. Add `aria-hidden="true"` to the separator when screen readers should ignore it.

## Examples

### Numeric masked PIN

```vue
<script setup lang="ts">
import { ref } from 'vue'

const pin = ref<Array<number | undefined>>([])

function handleComplete(value: Array<number | undefined>) {
  console.log(value.filter((digit): digit is number => digit !== undefined).join(''))
}
</script>

<template>
  <UIPinInput
    v-model="pin"
    type="number"
    mask
    placeholder="•"
    aria-label="Six-digit PIN"
    @complete="handleComplete"
  >
    <UIPinInputGroup>
      <UIPinInputSlot :index="0" />
      <UIPinInputSlot :index="1" />
      <UIPinInputSlot :index="2" />
      <UIPinInputSlot :index="3" />
      <UIPinInputSlot :index="4" />
      <UIPinInputSlot :index="5" />
    </UIPinInputGroup>
  </UIPinInput>
</template>
```

### Groups with a separator

```vue
<template>
  <UIPinInput aria-label="Recovery code">
    <UIPinInputGroup>
      <UIPinInputSlot :index="0" />
      <UIPinInputSlot :index="1" />
      <UIPinInputSlot :index="2" />
    </UIPinInputGroup>
    <UIPinInputSeparator aria-hidden="true" />
    <UIPinInputGroup>
      <UIPinInputSlot :index="3" />
      <UIPinInputSlot :index="4" />
      <UIPinInputSlot :index="5" />
    </UIPinInputGroup>
  </UIPinInput>
</template>
```

### Disabled required field with custom separator content

```vue
<template>
  <UIPinInput name="invite-code" :required="true" :disabled="true" aria-label="Invite code">
    <UIPinInputGroup>
      <UIPinInputSlot :index="0" />
      <UIPinInputSlot :index="1" />
    </UIPinInputGroup>
    <UIPinInputSeparator aria-hidden="true">/</UIPinInputSeparator>
    <UIPinInputGroup>
      <UIPinInputSlot :index="2" />
      <UIPinInputSlot :index="3" />
    </UIPinInputGroup>
  </UIPinInput>
</template>
```

## References

- [Local exports](./index.ts)
- [Local root implementation](./PinInput.vue)
- [Local group implementation](./PinInputGroup.vue)
- [Local slot implementation](./PinInputSlot.vue)
- [Local separator implementation](./PinInputSeparator.vue)
- [Nuxt shadcn configuration](../../../../nuxt.config.ts)
- [Input OTP guidance](../input-otp/AGENTS.md)
- [shadcn-vue Pin Input documentation](https://shadcn-vue.com/docs/components/pin-input)
- [Legacy shadcn-vue Pin Input documentation](https://v3.shadcn-vue.com/docs/components/pin-input)
- [Reka UI Pin Input documentation](https://reka-ui.com/docs/components/pin-input)
