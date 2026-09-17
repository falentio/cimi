# Checkbox

A control that lets the user toggle between checked and not checked; reach for it when collecting an independent boolean choice such as accepting terms.

## Conclusion

`UICheckbox` wraps `CheckboxRoot` with a built-in `CheckboxIndicator` that renders a tick icon, so you never compose the indicator yourself. `modelValue` is a single `T | "indeterminate" | null` value; use `UIFieldGroup` or the reka-ui `CheckboxGroupRoot` when you need an array of values. The one gotcha is that no label is rendered for you, so pair every checkbox with a `UILabel for="<id>"` that matches the checkbox `id` or the control stays unlabeled for screen readers.

## Usage

```vue
<template>
  <div class="flex items-center gap-3">
    <UICheckbox id="terms" v-model="accepted" />
    <UILabel for="terms">Accept terms and conditions</UILabel>
  </div>
</template>
```

## Meaningful Information

- Export is a single component, `Checkbox`, from `./Checkbox.vue`; the file re-exports no helper, type, or sub-part.
- `modelValue` (`null | T | "indeterminate"`) binds with `v-model` and holds one value at a time. Use a checkbox group (reka-ui `CheckboxGroupRoot`, not re-exported here) for array values.
- `defaultValue` sets the initial value for uncontrolled use and accepts `T | "indeterminate"`.
- `trueValue` defaults to `true`, `falseValue` defaults to `false`; set both to store custom strings or numbers.
- `value` is the data submitted with `name` and defaults to `"on"`.
- `name` submits the value as a form name/value pair; `required` blocks form submission while the value is unset.
- `disabled` blocks interaction, sets `disabled:cursor-not-allowed disabled:opacity-50`, and dims the checkbox inside a disabled `UIField` through `group-has-disabled/field:opacity-50`.
- `id` is forwarded to the root to support `UILabel for` pairing.
- `as` and `asChild` change the rendered element; the root renders `button` by default and the indicator renders `span`.
- `update:modelValue` emits `[value: T | "indeterminate"]` on change.
- The default slot receives `modelValue` and `state` (`false | true | "indeterminate"`); provide slot content to replace the tick icon.
- The indeterminate state is control-only: set `modelValue` to `"indeterminate"` yourself and render a distinct icon, because the built-in indicator shows the same tick for both checked and indeterminate.
- Styling hooks are `data-slot="checkbox"` on the root and `data-slot="checkbox-indicator"` on the indicator; the built-in tick icon sizes itself through `[&>svg]:size-3.5`.
- A hidden native `input` renders inside a form so events propagate, so style states with `data-checked`/`aria-checked` selectors rather than reaching for the input.
- Keyboard and ARIA behavior follow the tri-state Checkbox WAI-ARIA design pattern.

## Examples

```vue
<!-- Single checkbox bound to a boolean -->
<template>
  <div class="flex items-center gap-3">
    <UICheckbox id="terms" v-model="accepted" />
    <UILabel for="terms">Accept terms and conditions</UILabel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const accepted = ref(false)
</script>
```

```vue
<!-- Disabled checkbox -->
<template>
  <div class="flex items-center gap-3">
    <UICheckbox id="toggle" disabled :default-value="true" />
    <UILabel for="toggle">Enable notifications</UILabel>
  </div>
</template>
```

```vue
<!-- Indeterminate state with a distinct icon -->
<template>
  <div class="flex items-center gap-3">
    <UICheckbox id="select-all" v-model="state" />
    <UILabel for="select-all">Select all</UILabel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const state = ref<'indeterminate' | boolean>('indeterminate')
</script>
```

```vue
<!-- Custom true/false values -->
<template>
  <div class="flex items-center gap-3">
    <UICheckbox id="notify" v-model="choice" true-value="yes" false-value="no" />
    <UILabel for="notify">Enable notifications</UILabel>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const choice = ref('no')
</script>
```

## References

- [Checkbox](../checkbox/AGENTS.md)
- [Label](../label/AGENTS.md)
- [Field](../field/AGENTS.md)
- [shadcn-vue Checkbox](https://shadcn-vue.com/docs/components/checkbox)
- [reka-ui Checkbox](https://reka-ui.com/docs/components/checkbox)
