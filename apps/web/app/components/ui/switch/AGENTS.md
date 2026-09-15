# Switch

A two-state control that lets a user turn a setting on or off.

## Conclusion

Use `<UISwitch>` for one binary setting. The component wraps Reka UI's `SwitchRoot` and `SwitchThumb`, exposes a boolean `v-model` by default, and renders no visible label. Pair each switch with a `<UILabel>` and a matching `id`, or provide an accessible name with `aria-label` or `aria-labelledby`. Use `UIField` when the switch needs a horizontal or responsive label layout.

## Usage

`shadcn-nuxt` auto-imports the local `Switch` export as `<UISwitch>` because `apps/web/nuxt.config.ts` sets the `UI` prefix and `@/components/ui` component directory. Do not import `Switch` in a template. Lowercase helpers and type-only exports need explicit imports, but this directory exports no consumer helper or type.

```vue
<template>
  <UISwitch aria-label="Airplane mode" />
</template>
```

## Meaningful Information

- `index.ts` exports only `Switch` from `./Switch.vue`. The local wrapper imports `SwitchRoot`, `SwitchThumb`, and their types from `reka-ui`.
- `Switch.vue` renders one Reka `SwitchRoot` and one internal `SwitchThumb`. The root renders a native `button` by default. The thumb renders a `span` by default.
- The component's generic value type is `T`, which defaults to `boolean`. With the defaults, `v-model` reads and writes `true` or `false`.

  | Prop           | Type                      | Default      | Meaning                                                |
  | -------------- | ------------------------- | ------------ | ------------------------------------------------------ |
  | `modelValue`   | `null \| T`               | unset        | Controlled value used by `v-model`.                    |
  | `defaultValue` | `T`                       | `falseValue` | Initial value for uncontrolled use.                    |
  | `trueValue`    | `T`                       | `true`       | Value stored when the switch is checked.               |
  | `falseValue`   | `T`                       | `false`      | Value stored when the switch is unchecked.             |
  | `name`         | `string`                  | unset        | Name for the hidden form input.                        |
  | `value`        | `string`                  | `"on"`       | Submitted value for a checked switch with a `name`.    |
  | `required`     | `boolean`                 | unset        | Marks the switch as required and sets `aria-required`. |
  | `disabled`     | `boolean`                 | unset        | Prevents pointer and keyboard interaction.             |
  | `id`           | `string`                  | unset        | Identifies the root and enables label pairing.         |
  | `as`           | `AsTag \| Component`      | `"button"`   | Changes the root element or component.                 |
  | `asChild`      | `boolean`                 | unset        | Merges the root behavior into its first child.         |
  | `class`        | `HTMLAttributes['class']` | unset        | Adds classes to the styled root through `cn`.          |
  | `size`         | `"default" \| "sm"`       | `"default"`  | Selects the local root and thumb size styles.          |

- The root is checked when its current value strictly equals `trueValue`. It is unchecked for every other value. The root and thumb expose `data-state="checked"` or `data-state="unchecked"`.
- `defaultValue` selects the initial value without making the switch controlled. If it is omitted, the initial value is `falseValue`. Use `v-model` when parent state must stay in sync.
- Set `trueValue` and `falseValue` together when the application stores custom values. For example, `true-value="active"` and `false-value="inactive"` store strings instead of booleans. Use bound props such as `:true-value="1"` for numbers.
- `name`, `value`, and `required` affect the hidden native input only when the switch is inside a form. An unchecked checkbox input is not a successful form control, so an off switch contributes no name/value pair.
- `disabled` stops the internal toggle handler, adds `data-disabled` to the root and thumb, dims the root through the local styles, and disables the hidden form input.
- `orientation` is not a `UISwitch` or `SwitchRoot` prop. Use `<UIField orientation="horizontal">` or `<UIField orientation="responsive">` around the switch when the label layout needs to change. `UIField` owns that layout prop.
- `as` changes the root render target. `asChild` passes the root props and handlers to one child instead. Keep the replacement focusable and preserve switch semantics when using either option.
- `class` is consumed by the wrapper and merged with the local classes. The root has `data-slot="switch"` and `data-size`, and the thumb has `data-slot="switch-thumb"`.
- The declared component event is `update:modelValue` with one payload of type `T`. `v-model` wires this event automatically. Other native attributes and DOM listeners fall through to the Reka root.
- The consumer-facing named slot is `thumb`. It receives `modelValue` and `checked`, and its content renders inside the thumb. Default slot content is not rendered by this wrapper.
- The root has `role="switch"` and `aria-checked` set from the checked state. It also forwards `aria-label`, `aria-labelledby`, `aria-describedby`, and other `aria-*` attributes.
- Pair `<UILabel for="switch-id">` with `<UISwitch id="switch-id">`. Reka UI reads the matching label text as the switch's accessible name, and the native label also gives the user a larger click target. Use a unique `id` for every switch.
- Keep the label text stable when the switch changes. Put the state in a separate description or status element instead of changing a label from "On" to "Off".
- The default button toggles with `Space`. Reka UI handles `Enter` and prevents its default action. When `as` or `asChild` replaces the button, the replacement element must remain focusable and support these keyboard interactions.
- Inside a form, Reka UI renders a visually hidden sibling `input[type="checkbox"]` when `name` is present. The input carries `name`, `value`, `checked`, `required`, and `disabled`, so native form serialization and validation can use the switch.
- The default root button has `type="button"`, so toggling the switch does not submit its form. The hidden checkbox input supplies the form value.
- `required` does not create a form field by itself. Supply both a form ancestor and `name` when native required validation and form submission are needed.
- The switch uses the binary `switch` role. Use a checkbox when the product meaning is checked or unchecked, or when a third indeterminate state is needed.

## Examples

### Basic switch

```vue
<template>
  <UISwitch aria-label="Airplane mode" />
</template>
```

### Labeled switch

```vue
<template>
  <div class="flex items-center gap-2">
    <UISwitch id="airplane-mode" />
    <UILabel for="airplane-mode">Airplane mode</UILabel>
  </div>
</template>
```

### Disabled switch

```vue
<template>
  <div class="flex items-center gap-2">
    <UISwitch id="maintenance" disabled :default-value="true" />
    <UILabel for="maintenance">Maintenance mode</UILabel>
  </div>
</template>
```

### Controlled switch

```vue
<script setup lang="ts">
import { ref } from 'vue'

const notificationsEnabled = ref(false)
</script>

<template>
  <div class="flex items-center gap-2">
    <UISwitch id="notifications" v-model="notificationsEnabled" />
    <UILabel for="notifications">Notifications</UILabel>
    <span aria-live="polite">{{ notificationsEnabled ? 'On' : 'Off' }}</span>
  </div>
</template>
```

### Custom checked and unchecked values

```vue
<script setup lang="ts">
import { ref } from 'vue'

const status = ref<'active' | 'inactive'>('inactive')
</script>

<template>
  <UISwitch
    v-model="status"
    aria-label="Account status"
    true-value="active"
    false-value="inactive"
  />
</template>
```

## References

- [Local implementation](./Switch.vue)
- [Local export](./index.ts)
- [Label](../label/AGENTS.md) for accessible label pairing.
- [Field](../field/AGENTS.md) for horizontal and responsive switch layouts.
- [shadcn-vue Switch documentation](https://shadcn-vue.com/docs/components/switch)
- [Reka UI Switch documentation](https://reka-ui.com/docs/components/switch)
- [Reka UI composition guide](https://reka-ui.com/docs/guides/composition)
- [WAI-ARIA switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/)
