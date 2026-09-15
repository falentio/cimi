# Input OTP

Collects a fixed-length one-time password through one accessible native input rendered as styled slots.

## Conclusion

Use `<UIInputOTP>` for verification codes and other one-time passwords. Compose it with `<UIInputOTPGroup>`, `<UIInputOTPSlot>`, and optional `<UIInputOTPSeparator>` children. Set `maxlength` to the total number of slots. The `v-model` value is one string, not an array of characters.

## Usage

```vue
<script setup lang="ts">
import { ref } from 'vue'

const code = ref('')
</script>

<template>
	<UIInputOTP
		id="verification-code"
		v-model="code"
		:maxlength="6"
		aria-label="Verification code"
	>
		<UIInputOTPGroup>
			<UIInputOTPSlot :index="0" />
			<UIInputOTPSlot :index="1" />
			<UIInputOTPSlot :index="2" />
			<UIInputOTPSlot :index="3" />
			<UIInputOTPSlot :index="4" />
			<UIInputOTPSlot :index="5" />
		</UIInputOTPGroup>
	</UIInputOTP>
</template>
```

## Meaningful Information

### Exports and auto-imports

- `index.ts` exports only `InputOTP`, `InputOTPGroup`, `InputOTPSeparator`, and `InputOTPSlot`.
- `shadcn-nuxt` auto-imports those exports with the project prefix. Use `<UIInputOTP>`, `<UIInputOTPGroup>`, `<UIInputOTPSeparator>`, and `<UIInputOTPSlot>` in templates. Do not import these components in a template.
- `REGEXP_ONLY_DIGITS`, `REGEXP_ONLY_CHARS`, `REGEXP_ONLY_DIGITS_AND_CHARS`, `OTPInputProps`, `OTPInputEmits`, `RenderProps`, `SlotProps`, and `useVueOTPContext` come from `vue-input-otp`. The local `index.ts` does not re-export them. Import runtime helpers explicitly, and use `import type` for type-only exports.
- Lowercase helpers, Vue refs, third-party APIs, icons, and types need explicit imports in `<script setup>`. Component tags do not.

### Composition

- Put every `<UIInputOTPSlot>` inside a `<UIInputOTP>` descendant. The slot reads its state from the nearest `UIInputOTP` context.
- Use one or more `<UIInputOTPGroup>` elements to wrap consecutive slots. Put `<UIInputOTPSeparator>` between groups.
- Index slots globally from `0` through `maxlength - 1`. The component does not infer indices from the child order.
- Render exactly `maxlength` slots. A missing index leaves a visual position empty, and an index outside the range has no slot state.
- The local root wraps the `vue-input-otp` `OTPInput` component. That component renders one container, the default slot content, and one real `<input>` positioned over the slots.
- `UIInputOTPGroup` renders a styled `<div>`. `UIInputOTPSlot` renders a styled `<div>` for one position. `UIInputOTPSeparator` renders a styled `<div role="separator">`.

### Root props and value

| Prop | Type or default | Behavior |
| --- | --- | --- |
| `maxlength` | `number`, required | Sets the number of slot states and caps the string value. |
| `modelValue` | `string` | Binds through `v-model`. The value contains the complete code typed so far. |
| `defaultValue` | `any`, default `''` | Seeds an uncontrolled value. Pass a string even though the upstream declaration uses `any`. |
| `pattern` | `string` | Tests the whole prospective value on typing and paste. The component rejects the whole change when the pattern fails. There is no default pattern. |
| `placeholder` | `string` | Forwards to the real input and exposes per-position `placeholderChar` values to the root slot. The built-in `UIInputOTPSlot` does not render those values. |
| `inputmode` | `'numeric' \| 'text'`, default `'numeric'` | Selects the mobile keyboard. Use `inputmode="text"` for alphanumeric codes. This Vue prop is lowercase. |
| `textAlign` | `'left' \| 'center' \| 'right'`, default `'left'` | Aligns the invisible input text. It affects tap and selection placement, not the visible slot row. Use `text-align` in a template. |
| `pushPasswordManagerStrategy` | `'increase-width' \| 'none'`, default `'increase-width'` | Reserves clipped input width so password manager badges sit beside the last slot. Set it to `none` to disable detection and the extra width. |
| `pasteTransformer` | `(pasted: string \| undefined) => string` | Rewrites clipboard text before validation and insertion. Supplying it enables the manual paste path on every platform. |
| `disabled` | `boolean` | Disables the real input and adds the local disabled styling to the container. |
| `autocomplete` | `string`, default `'one-time-code'` | Enables SMS one-time-code suggestions unless you override it. |
| `noScriptCssFallback` | `string \| null`, default built-in CSS | Controls the stylesheet that makes the hidden input usable when JavaScript is disabled. Pass `null` to remove it. |
| `nonce` | `string` | Adds a CSP nonce to the injected stylesheet. |
| `class` | `HTMLAttributes['class']` | Merges into the visible root container. Use this for local layout changes. |

The root also accepts native input attributes such as `id`, `name`, `required`, `autofocus`, `readonly`, `type`, `aria-*`, and `data-*`. The wrapper forwards them to the real input. Use `v-model` or `defaultValue` for the value instead of relying on the native `value` attribute.

`maxlength` is a component prop and must be bound as a number when using a numeric literal. `:maxlength="6"` is the clear form.

### Events

| Event | Payload | Behavior |
| --- | --- | --- |
| `update:modelValue` | `string \| undefined` in the generated declaration | Drives `v-model`. Runtime value changes are strings. |
| `input` | `string` | Fires with the new code after typing, deletion, cutting, or accepted paste. This is a value event, not an `InputEvent`. |
| `complete` | `string` | Fires when the value changes from shorter than `maxlength` to exactly `maxlength`. Use it to verify or submit the code. |
| `focus` | `FocusEvent` | Fires when the real input receives focus. |
| `blur` | `FocusEvent` | Fires when the real input loses focus. |
| `mouseover` | `MouseEvent` | Fires when the pointer enters the real input. |
| `mouseleave` | `MouseEvent` | Fires when the pointer leaves the real input. |
| `paste` | `ClipboardEvent` | Fires for paste attempts. The primitive handles the paste manually on iOS and whenever `pasteTransformer` is set. |
| `change` | `Event` in the type declaration | Declared by `OTPInputEmits`, but `vue-input-otp@0.4.0` does not emit it. Use `input` for value changes. |
| `select` | `Event` in the type declaration | Declared by `OTPInputEmits`, but `vue-input-otp@0.4.0` does not emit it. |

Unrecognized attributes and listeners such as `@keydown` fall through to the real input. The wrapper uses Reka UI's `useForwardPropsEmits` to pass declared props and events to the underlying component.

### Child props and slots

- `UIInputOTPGroup` accepts `class` and exposes a default slot with no slot props. Its classes add the invalid-state ring when the real input has `aria-invalid`.
- `UIInputOTPSlot` requires `index: number` and accepts `class`. It reads `char`, `isActive`, and `hasFakeCaret` from the root context. It renders `char` and a blinking fake caret for an active empty position.
- `UIInputOTPSlot` has no useful content slot. Put custom rendering in the root `UIInputOTP` default slot instead.
- `UIInputOTPSeparator` accepts `class` and exposes a default slot. Its default content is the Hugeicons `MinusSignIcon`. Slot content replaces that icon.
- The `UIInputOTP` default slot receives `{ slots, isFocused, isHovering }`. `slots` always has `maxlength` entries. Each entry has `{ char, placeholderChar, isActive, hasFakeCaret }`.
- `placeholderChar` is set only while the complete value is empty. The built-in `UIInputOTPSlot` renders only `char`, so use a custom root slot when visible placeholders are required.

### Accessibility

- The underlying component keeps one real input. It provides one tab stop, one value, native selection, native copy and paste, and SMS autofill through `autocomplete="one-time-code"`.
- Give the input an accessible name. Pair `id` with a native `<label for="...">`, or pass `aria-label` or `aria-labelledby`.
- Connect instructions and errors with `aria-describedby`. Set `aria-invalid="true"` on `UIInputOTP` when the code is invalid.
- The slot boxes are visual output. Do not add a role, label, or `tabindex` to `UIInputOTPSlot` content.
- Separators are visual output and the local separator sets `role="separator"`. Add `aria-hidden="true"` when the separator is purely decorative and should not enter the accessibility tree.
- The built-in slot marks the active position with `data-active` and a visible ring. A custom root slot must expose focus through `isActive` or `isFocused` without depending on animation alone.
- `disabled` reaches the real input, prevents keyboard interaction, and applies `has-disabled:opacity-50` to the root container.

### Gotchas

- `inputmode` is lowercase in the Vue package. Use `inputmode="numeric"` or `inputmode="text"`, not the React spelling `inputMode`.
- A `pattern` rejects an entire candidate value. Use a pattern that accepts every valid partial value, such as `^\\d+$`, rather than one that requires the final length, such as `^\\d{6}$`.
- `placeholder` is not visible with the built-in slot component because `InputOTPSlot.vue` ignores `placeholderChar`.
- Pass `class` to `UIInputOTP` for the visible container. The local wrapper supplies its own `container-class` binding, so a consumer `container-class` prop does not replace the wrapper classes.
- The local wrapper always passes `:spellcheck="false"` to the underlying component. Do not expect a consumer `spellcheck` value to enable spelling checks.
- The default password manager strategy may reserve up to 40 pixels of clipped width. Set `:push-password-manager-strategy="'none'"` when the field is in a tight horizontal layout or your own password manager rules handle the badge.
- A native `type="password"` only masks the underlying input. The built-in `UIInputOTPSlot` still renders each `char`, so use a custom root slot to replace characters with masking glyphs.
- `complete` reports that the string reached the required length. It does not verify that the code is correct. Perform verification in the handler or on the server.
- `UIInputOTPSlot` outside an `UIInputOTP` context has no character state. Keep every slot under the root.

## Examples

### Alphanumeric pattern

```vue
<script setup lang="ts">
import { REGEXP_ONLY_DIGITS_AND_CHARS } from 'vue-input-otp'
</script>

<template>
	<UIInputOTP
		:maxlength="6"
		:pattern="REGEXP_ONLY_DIGITS_AND_CHARS"
		inputmode="text"
		aria-label="Alphanumeric verification code"
	>
		<UIInputOTPGroup>
			<UIInputOTPSlot :index="0" />
			<UIInputOTPSlot :index="1" />
			<UIInputOTPSlot :index="2" />
			<UIInputOTPSlot :index="3" />
			<UIInputOTPSlot :index="4" />
			<UIInputOTPSlot :index="5" />
		</UIInputOTPGroup>
	</UIInputOTP>
</template>
```

### Groups with separators

```vue
<template>
	<UIInputOTP :maxlength="6" aria-label="Verification code">
		<UIInputOTPGroup>
			<UIInputOTPSlot :index="0" />
			<UIInputOTPSlot :index="1" />
		</UIInputOTPGroup>
		<UIInputOTPSeparator aria-hidden="true" />
		<UIInputOTPGroup>
			<UIInputOTPSlot :index="2" />
			<UIInputOTPSlot :index="3" />
		</UIInputOTPGroup>
		<UIInputOTPSeparator aria-hidden="true" />
		<UIInputOTPGroup>
			<UIInputOTPSlot :index="4" />
			<UIInputOTPSlot :index="5" />
		</UIInputOTPGroup>
	</UIInputOTP>
</template>
```

### Completion handler

```vue
<script setup lang="ts">
import { ref } from 'vue'

const code = ref('')
const completedCode = ref('')

function handleComplete(value: string) {
	completedCode.value = value
}
</script>

<template>
	<div class="flex flex-col gap-2">
		<UIInputOTP
			id="otp-completion"
			v-model="code"
			:maxlength="6"
			aria-label="Verification code"
			@complete="handleComplete"
		>
			<UIInputOTPGroup>
				<UIInputOTPSlot :index="0" />
				<UIInputOTPSlot :index="1" />
				<UIInputOTPSlot :index="2" />
				<UIInputOTPSlot :index="3" />
				<UIInputOTPSlot :index="4" />
				<UIInputOTPSlot :index="5" />
			</UIInputOTPGroup>
		</UIInputOTP>
		<p v-if="completedCode">Code received: {{ completedCode }}</p>
	</div>
</template>
```

### Custom root slot with placeholders

```vue
<template>
	<UIInputOTP
		v-slot="{ slots, isFocused }"
		:maxlength="6"
		placeholder="______"
		aria-label="Verification code"
	>
		<div class="flex gap-2" :data-focused="isFocused">
			<div v-for="(slot, index) in slots" :key="index">
				{{ slot.char ?? slot.placeholderChar }}
			</div>
		</div>
	</UIInputOTP>
</template>
```

## References

- [Local export](./index.ts)
- [Local root implementation](./InputOTP.vue)
- [Local group implementation](./InputOTPGroup.vue)
- [Local slot implementation](./InputOTPSlot.vue)
- [Local separator implementation](./InputOTPSeparator.vue)
- [Field component guidance](../field/AGENTS.md)
- [shadcn-vue Input OTP documentation](https://shadcn-vue.com/docs/components/input-otp)
- [vue-input-otp documentation](https://vue-input-otp.vercel.app/)
- [vue-input-otp 0.4.0 declarations](https://unpkg.com/vue-input-otp@0.4.0/dist/index.d.ts)
- [Upstream input-otp API reference](https://input-otp.rodz.dev/docs/api)
- [Upstream input-otp accessibility guide](https://input-otp.rodz.dev/docs/accessibility)
- [Reka UI `useForwardPropsEmits`](https://reka-ui.com/docs/utilities/use-forward-props-emits)
- [Vue component `v-model`](https://vuejs.org/guide/components/v-model.html)
