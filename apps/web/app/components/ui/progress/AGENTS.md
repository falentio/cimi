# Progress

Displays the completion state of a task as an accessible horizontal progress bar.

## Conclusion

`UIProgress` is the only public component in this folder. It wraps Reka UI's `ProgressRoot` and renders a fixed `ProgressIndicator`. The wrapper defaults `modelValue` to `0`, while Reka UI defaults `max` to `100`. Use `<UIProgress>` without a component import in Nuxt templates. The wrapper has no public child parts or usable slots.

## Usage

```vue
<template>
  <UIProgress :model-value="33" aria-label="Upload progress" />
</template>
```

## Meaningful Information

- `index.ts` exports `Progress` from `Progress.vue`. The `shadcn-nuxt` configuration maps that export to `<UIProgress>` because `apps/web/nuxt.config.ts` sets the prefix to `UI` and the component directory to `@/components/ui`.
- `ProgressRootProps` provides these props through `Progress.vue`.

  | Prop            | Type                                                                       | Default                                 | Behavior                                                         |
  | --------------- | -------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
  | `modelValue`    | `number \| null`                                                           | `0` in this wrapper                     | The current progress value. Use `null` for an indeterminate bar. |
  | `max`           | `number`                                                                   | `100` from Reka UI                      | The maximum progress value. It must be greater than `0`.         |
  | `getValueLabel` | `(value: number \| null \| undefined, max: number) => string \| undefined` | A rounded percentage for numeric values | Supplies the accessible `aria-label` text.                       |
  | `getValueText`  | `(value: number \| null \| undefined, max: number) => string \| undefined` | None                                    | Supplies the accessible `aria-valuetext` text.                   |
  | `as`            | `AsTag \| Component`                                                       | `"div"`                                 | Changes the root element or component.                           |
  | `asChild`       | `boolean`                                                                  | `false`                                 | Merges the root behavior into the child element.                 |
  | `class`         | `HTMLAttributes['class']`                                                  | None                                    | Merges extra classes into the progress root.                     |

- Numeric `modelValue` values must satisfy `0 <= modelValue <= max` and must not be `NaN`. `null` and `undefined` are valid indeterminate values in Reka UI, but this wrapper's default changes an omitted or undefined value to `0`. Pass `:model-value="null"` to request indeterminate state.
- `max` must be a number greater than `0` and must not be `NaN`. Reka UI logs invalid values to the console and corrects an invalid progress value to `null` or an invalid maximum to `100`.
- The root and indicator expose `data-state` with `loading`, `complete`, or `indeterminate`. `0` is `loading`, a value equal to `max` is `complete`, and `null` is `indeterminate`.
- The root and indicator expose `data-value` for the current numeric value and `data-max` for the maximum. `data-value` is omitted when the value is indeterminate.
- The wrapper adds `data-slot="progress"` to the root and `data-slot="progress-indicator"` to the indicator. Use these attributes for targeted styling or selectors.
- The root renders with `bg-muted h-1 rounded-full relative flex w-full items-center overflow-x-hidden`. The indicator renders with `bg-primary size-full flex-1 transition-all`. A `class` prop customizes the root only. There is no public indicator class prop.
- Reka UI gives the root `role="progressbar"`, `aria-valuemin="0"`, `aria-valuemax` from `max`, and `aria-valuenow` for numeric values. It omits `aria-valuenow` for indeterminate values. Add a task-specific accessible name with `getValueLabel` or an `aria-label` attribute.
- The component has no progress-specific `orientation` or direction prop. It renders a horizontal bar, and its indicator always uses a negative X translation.
- Use `v-model` with a `number | null` state. The wrapper forwards Reka UI's `update:modelValue` and `update:max` events through its root. Their declared payloads are `[value: string[] | undefined]` and `[value: number]`. Reka UI's generated `update:modelValue` declaration reports a string array even though the prop and validation logic use numeric values. Keep the bound state numeric and prefer `v-model` over a manually typed listener.
- The underlying Reka root exposes a default slot with `modelValue`, but `Progress.vue` does not render or forward that slot. Child content inside `<UIProgress>` is ignored.
- The indicator style uses `translateX(-${100 - modelValue}%)`, so it assumes that `modelValue` is already a percentage out of `100`. With a custom `max`, Reka UI reports the correct ARIA and data values, but this wrapper's visual fill does not scale the value by `max`.
- An indeterminate value gets `data-state="indeterminate"` and an indicator translation of `-100%`. This local wrapper does not add an indeterminate animation, so the track appears empty unless you add styling that targets the indeterminate data state.

## Examples

```vue
<template>
  <UIProgress :model-value="66" class="w-[60%]" aria-label="Upload progress" />
</template>
```

```vue
<script setup lang="ts">
import { ref } from 'vue'

const progress = ref<number | null>(13)
</script>

<template>
  <UIProgress v-model="progress" class="w-[60%]" aria-label="Upload progress" />
</template>
```

```vue
<script setup lang="ts">
import { ref } from 'vue'

const progress = ref<number | null>(null)
const getValueLabel = (value: number | null | undefined, max: number) =>
  value == null ? 'Preparing your workspace' : `Workspace progress, ${value} of ${max}`
const getValueText = (value: number | null | undefined, max: number) =>
  value == null ? 'Preparing' : `${value} of ${max} complete`
</script>

<template>
  <UIProgress v-model="progress" :get-value-label="getValueLabel" :get-value-text="getValueText" />
</template>
```

## References

- [Local `Progress.vue`](./Progress.vue)
- [Local `index.ts`](./index.ts)
- [shadcn-vue Progress documentation](https://shadcn-vue.com/docs/components/progress)
- [Reka UI Progress documentation](https://reka-ui.com/docs/components/progress)
- [WAI-ARIA progressbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/meter)
