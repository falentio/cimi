# Toggle

A two-state button that lets a user turn a mode on or off.

## Conclusion

Use `<UIToggle>` for one persistent on or off state. The local wrapper adds `variant`, `size`, and `class` to Reka UI's toggle primitive. Use `v-model` when parent state owns the pressed value, or `default-value` for an initial uncontrolled value. The main gotchas are that this component has no `icon` size, and its Reka props are named `modelValue` and `defaultValue`, not `pressed` and `defaultPressed`.

## Usage

`shadcn-nuxt` scans `@/components/ui` and prefixes the local `Toggle` export with `UI`, as configured in `apps/web/nuxt.config.ts`. Use `<UIToggle>` in templates without importing the component. Import lowercase helpers and type-only exports explicitly.

```vue
<template>
  <UIToggle aria-label="Toggle bold">Bold</UIToggle>
</template>
```

## Meaningful Information

- `index.ts` exports `Toggle` from `Toggle.vue`, the `toggleVariants` helper, and the type-only `ToggleVariants` type.
- Use `toggleVariants` with `import { toggleVariants } from '@/components/ui/toggle'`. Use `ToggleVariants` with `import type { ToggleVariants } from '@/components/ui/toggle'`.
- The wrapper renders one Reka UI `Toggle` root and forwards its slot, props, and emits. It adds `data-slot="toggle"` to the root.
- The root renders a `button` by default. `as` accepts `AsTag | Component` and changes the render target. `asChild` is written as `as-child` in templates. It merges the toggle behavior into exactly one child element and takes precedence over `as`.
- `variant` accepts exactly `"default" | "outline"`. It defaults to `"default"`. The `default` variant has a transparent background. The `outline` variant adds an input-colored border.
- `size` accepts exactly `"default" | "sm" | "lg"`. It defaults to `"default"`. There is no `"icon"` size.
- `class` accepts `HTMLAttributes['class']`. The wrapper merges it with `toggleVariants({ variant, size })` through `cn`, so use it for layout or style overrides.
- `disabled` defaults to `false`. It prevents pointer and keyboard interaction, forwards to the default button, exposes the disabled data state, and applies the local opacity and pointer-event styles.
- `v-model` binds the controlled pressed state through `modelValue`, which accepts `boolean | null`. The component emits `update:modelValue` with a boolean payload when the state changes.
- `default-value` maps to Reka UI's `defaultValue` and sets the initial pressed state for uncontrolled use. It is read on initial render. Changing it later does not control the toggle.
- The local wrapper does not declare `pressed` or `defaultPressed` props. Use `v-model` or `modelValue` for controlled state, and `default-value` or `defaultValue` for initial state.
- `name` and `required` are forwarded Reka UI props for form use. `name` supplies the form field name. `required` marks the toggle as required for its owning form.
- Listen for `@update:model-value` when you need the new boolean value. Native attributes and DOM listeners such as `@click` pass through to the Reka root. Use `v-model` rather than a click handler when the parent must own the state.
- The default slot renders the label and any icons. Its slot props are `modelValue`, `state` with values `"on" | "off"`, `pressed`, and `disabled`.
- There is no icon prop and no internal icon component. Put an icon in the default slot. Icons without a `size-*` class receive `size-4` by default and `size-3.5` with `size="sm"`. Add an explicit `size-*` class when the icon needs a different size.
- The base styles use `gap-1`, prevent pointer events on nested SVGs, and prevent nested SVGs from shrinking. A child with `data-icon="inline-start"` or `data-icon="inline-end"` also adjusts the horizontal padding for the default and small sizes.
- Reka UI exposes `data-state="on" | "off"` and the corresponding `aria-pressed` state on the root. Use these attributes for state-dependent styling or status text.
- The default button receives focus through normal `Tab` navigation. `Space` and `Enter` activate or deactivate it. An `as-child` replacement must stay focusable and preserve one accessible toggle control.
- Give a text toggle a clear visible label. Give an icon-only toggle an accessible name with `aria-label` or `aria-labelledby`. Mark decorative icons with `aria-hidden="true"`.
- Keep interactive children out of the toggle. `as-child` accepts one child, and nested links or buttons create competing controls.
- Use `<UIButton>` for a stateless action. `UIButton` has no pressed state or `v-model`. Use `<UIToggle>` when the control stays on or off after activation.
- Use `<UIToggleGroup>` with `<UIToggleGroupItem>` for a coordinated set of toggles. The group owns single or multiple selection and item values. A standalone `<UIToggle>` owns one boolean state.

## Examples

### Basic

```vue
<template>
  <UIToggle aria-label="Toggle bold">Bold</UIToggle>
</template>
```

### Outline

```vue
<template>
  <UIToggle variant="outline" aria-label="Toggle italic">Italic</UIToggle>
</template>
```

### Controlled pressed state

```vue
<script setup lang="ts">
import { ref } from 'vue'

const bold = ref(false)
</script>

<template>
  <UIToggle v-model="bold" aria-label="Toggle bold">Bold</UIToggle>
  <output aria-live="polite">{{ bold ? 'On' : 'Off' }}</output>
</template>
```

### Icon-only toggle

```vue
<template>
  <UIToggle aria-label="Toggle bold">
    <svg
      class="size-4"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      viewBox="0 0 24 24"
    >
      <path d="M7 4h6a4 4 0 0 1 0 8H7m6 0h1a4 4 0 0 1 0 8H7V4" />
    </svg>
  </UIToggle>
</template>
```

### Link with `as-child`

```vue
<template>
  <UIToggle as-child aria-label="Toggle preview">
    <a href="#preview">Preview</a>
  </UIToggle>
</template>
```

Use the default button for a state toggle. Use `as-child` with a link only when the child must own navigation and the resulting control still has a clear toggle meaning.

## References

- [Local implementation](./Toggle.vue)
- [Local exports and variants](./index.ts)
- [Button](../button/AGENTS.md) for stateless actions
- [shadcn-vue Toggle documentation](https://shadcn-vue.com/docs/components/toggle)
- [shadcn-vue Toggle Group documentation](https://shadcn-vue.com/docs/components/toggle-group)
- [Reka UI Toggle documentation](https://reka-ui.com/docs/components/toggle)
