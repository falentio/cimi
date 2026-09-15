# Slider

Provides a styled input for choosing one or more numeric values within a range.

## Conclusion

Use `<UISlider>` as a self-closing component. Bind `v-model` to a `number[]` when the parent owns the value, or use `default-value` for an uncontrolled initial value. A single thumb still uses an array such as `[50]`. A range uses an array such as `[25, 75]`. This folder exports only `Slider`, which Nuxt exposes as `<UISlider>` with no template import.

## Usage

```vue
<template>
  <UISlider :default-value="[33]" :max="100" :step="1" aria-label="Progress" />
</template>
```

## Meaningful Information

### Exports and composition

- `index.ts` exports `Slider` from `Slider.vue`.
- `Slider.vue` composes Reka UI's `SliderRoot`, `SliderTrack`, `SliderRange`, and `SliderThumb` internally. These parts are not exported from this folder.
- `shadcn-nuxt` maps the export to `<UISlider>` because `apps/web/nuxt.config.ts` sets the `UI` prefix and `@/components/ui` component directory. Do not import `Slider` in a template.
- Use explicit imports for lowercase helpers such as `ref`. This index has no consumer-facing lowercase helper or type-only export.
- The component renders one thumb for every item in the root `modelValue` array. It renders a track and a range automatically, so child content has no public composition role.

### Root props

`<UISlider>` forwards `SliderRootProps` from Reka UI and adds the local `class` prop.

| Template prop              | Type                         | Default              | Meaning                                                                                       |
| -------------------------- | ---------------------------- | -------------------- | --------------------------------------------------------------------------------------------- |
| `as`                       | `AsTag \| Component`         | `"span"`             | Changes the root element or component.                                                        |
| `as-child`                 | `boolean`                    | `false`              | Merges the slider behavior into one child element.                                            |
| `default-value`            | `number[]`                   | `[0]`                | Sets the initial value for uncontrolled usage. The array length sets the initial thumb count. |
| `dir`                      | `"ltr" \| "rtl"`             | Inherited or `"ltr"` | Sets the reading direction. Horizontal keyboard and visual direction follow this setting.     |
| `disabled`                 | `boolean`                    | `false`              | Prevents user interaction and marks the slider disabled.                                      |
| `inverted`                 | `boolean`                    | `false`              | Visually inverts the slider and the orientation-specific keyboard behavior.                   |
| `max`                      | `number`                     | `100`                | Sets the largest allowed value.                                                               |
| `min`                      | `number`                     | `0`                  | Sets the smallest allowed value.                                                              |
| `min-steps-between-thumbs` | `number`                     | `0`                  | Sets the minimum number of step intervals between multiple thumbs.                            |
| `model-value`              | `number[] \| null`           | Unset                | Supplies the controlled value used by `v-model`.                                              |
| `name`                     | `string`                     | Unset                | Names the form value. Reka UI renders an input for each thumb inside a form.                  |
| `orientation`              | `"vertical" \| "horizontal"` | `"horizontal"`       | Sets the slider orientation.                                                                  |
| `required`                 | `boolean`                    | Unset                | Marks the slider value as required for its owning form.                                       |
| `step`                     | `number`                     | `1`                  | Sets the increment used by pointer and keyboard changes.                                      |
| `thumb-alignment`          | `"contain" \| "overflow"`    | `"contain"`          | Controls whether thumbs stay within the track bounds or can overflow them.                    |
| `class`                    | `HTMLAttributes['class']`    | Unset                | Adds classes to the styled root. The wrapper merges them with its local root classes.         |

The component does not support a `readonly` prop. Use `disabled` when the slider must not accept input. A read-only enabled slider needs a separate display or a wrapper change because `readonly` does not change this component's behavior.

### Values and constraints

- `v-model` uses `number[] \| null`, never a scalar. Use `ref<number[]>([50])` for a controlled single thumb or `ref<number[]>([25, 75])` for a controlled range.
- `default-value` uses the same array shape and only seeds uncontrolled state. Use `:default-value="[50]"` for a numeric array.
- The default value is `[0]`, so an omitted value renders one thumb at `0`.
- Each array item represents one thumb. Use two ordered values for a range, such as `[25, 75]`.
- The local wrapper loops over `modelValue` to render thumbs. Keep the array length stable unless changing the number of thumbs is intentional. A controlled `null` value gives the wrapper no items to loop over and therefore no rendered thumbs.
- `min` and `max` define the numeric bounds. `step` defaults to `1` and controls the interval between valid values.
- `min-steps-between-thumbs` applies only when multiple thumbs exist. With `:step="10"` and `:min-steps-between-thumbs="1"`, adjacent thumbs must stay at least `10` units apart.
- `name` and `required` apply to form participation. The Reka root creates an input for each thumb when it is inside a form.

### Orientation, direction, and inversion

- `orientation` defaults to `"horizontal"`. The local styles give a horizontal root full width. Give a vertical slider a non-zero height, for example `class="h-48"`.
- `dir` accepts `"ltr"` or `"rtl"`. If omitted, the value comes from Reka UI's `ConfigProvider` or defaults to left-to-right. Use `dir="rtl"` for right-to-left horizontal controls.
- `inverted` reverses the visual direction. It also reverses the keyboard controls listed in the accessibility section, with the affected keys depending on orientation.
- The root, track, range, and thumbs expose Reka UI orientation and disabled data attributes. The local wrapper also adds `data-slot` values and a `data-vertical` marker when the orientation is vertical.

### Events and slots

- `@update:model-value` receives a `number[]` payload whenever the value changes during interaction. It is the event used by `v-model`.
- `@value-commit` receives a `number[]` payload when an interaction ends. Use it when a final value should trigger work such as a backend update.
- The underlying `SliderRoot` provides a default scoped slot with `modelValue` shaped as `number[] \| null`. `Slider.vue` consumes that slot to render thumbs and does not expose it.
- `<UISlider>` has no public slots. Content placed between its tags is not rendered.
- The wrapper has no public thumb, track, or range components. Use the `class` prop and the local `data-slot` attributes for styling, or change the wrapper when custom composition is required.
- Pointer events are the reliable interaction events. Reka UI documents a limitation where `mousedown` and `mouseup` handlers do not fire on the slider root. Prefer `@pointerdown` and `@pointerup`.

### Keyboard and accessibility

Reka UI follows the [WAI-ARIA slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slidertwothumb). Focus a thumb before using these keys.

| Key                 | Result                                |
| ------------------- | ------------------------------------- |
| `ArrowRight`        | Increases the value by `step`.        |
| `ArrowLeft`         | Decreases the value by `step`.        |
| `ArrowUp`           | Increases the value by `step`.        |
| `ArrowDown`         | Decreases the value by `step`.        |
| `PageUp`            | Increases the value by a larger step. |
| `PageDown`          | Decreases the value by a larger step. |
| `Shift + ArrowUp`   | Increases the value by a larger step. |
| `Shift + ArrowDown` | Decreases the value by a larger step. |
| `Home`              | Sets the value to `min`.              |
| `End`               | Sets the value to `max`.              |

- `dir="rtl"` changes the horizontal reading direction. `inverted` also changes keyboard direction. For a horizontal inverted slider, `ArrowRight`, `ArrowLeft`, `Home`, and `End` are inverted. For a vertical inverted slider, `ArrowUp`, `ArrowDown`, `PageUp`, `PageDown`, `Shift + ArrowUp`, and `Shift + ArrowDown` are inverted.
- Give the slider an accessible name with `aria-label` or `aria-labelledby`. Describe the value's meaning in the label, especially when a range has two thumbs.
- The root renders an input for each thumb inside a form, which lets browser form events propagate. The wrapper's automatic thumbs keep the slider keyboard accessible without manual thumb markup.

### Gotchas

- Use array syntax for every value. `:default-value="[50]"` is correct for one thumb. `:default-value="50"` is not.
- Use `v-model` for controlled state and `default-value` for uncontrolled state. Changing `default-value` after mount does not replace controlled state.
- The component has no built-in read-only state. `readonly` is not a documented or forwarded `SliderRootProps` option.
- A vertical slider needs a height from the component or its parent. Without one, the track has no useful vertical extent.
- The wrapper owns all slider parts. Passing custom thumbs or tracks as child content does not add them.
- `mousedown` and `mouseup` are not reliable on the Reka root. Use pointer events when tracking the interaction boundary.

## Examples

### Single value

```vue
<script setup lang="ts">
import { ref } from 'vue'

const volume = ref<number[]>([50])
</script>

<template>
  <UISlider v-model="volume" :max="100" :step="1" aria-label="Volume" />
</template>
```

### Range values

```vue
<script setup lang="ts">
import { ref } from 'vue'

const priceRange = ref<number[]>([25, 75])
</script>

<template>
  <UISlider
    v-model="priceRange"
    :min="0"
    :max="100"
    :step="5"
    :min-steps-between-thumbs="1"
    aria-label="Price range"
  />
</template>
```

### Vertical orientation

```vue
<template>
  <UISlider :default-value="[50]" orientation="vertical" class="h-48" aria-label="Vertical level" />
</template>
```

### Disabled slider

```vue
<template>
  <UISlider :default-value="[25]" disabled aria-label="Locked level" />
</template>
```

## References

- [Local export](./index.ts)
- [Local implementation](./Slider.vue)
- [shadcn-vue Slider documentation](https://shadcn-vue.com/docs/components/slider)
- [Reka UI Slider documentation](https://reka-ui.com/docs/components/slider)
- [WAI-ARIA slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slidertwothumb)
