# Toggle Group

A coordinated set of two-state buttons that lets users select one or more values.

## Conclusion

Use `<UIToggleGroup>` with `<UIToggleGroupItem>` when related toggles share selection state. Set `type="single"` for one active value or `type="multiple"` for an array of active values. The wrapper adds the local `variant`, `size`, `spacing`, and `class` API while Reka UI supplies selection state, roving focus, orientation, and keyboard behavior.

## Usage

`shadcn-nuxt` scans `@/components/ui` and prefixes the local exports with `UI`, as configured in `apps/web/nuxt.config.ts`. Use `<UIToggleGroup>` and `<UIToggleGroupItem>` in templates without importing them.

```vue
<template>
  <UIToggleGroup type="single" aria-label="Text alignment">
    <UIToggleGroupItem value="left">Left</UIToggleGroupItem>
    <UIToggleGroupItem value="center">Center</UIToggleGroupItem>
    <UIToggleGroupItem value="right">Right</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

The local index has no lowercase helpers or type-only exports. Import `toggleVariants` or `ToggleVariants` explicitly from `@/components/ui/toggle` if code needs the shared toggle styles or type.

## Meaningful Information

- `index.ts` exports the named components `ToggleGroup` from `ToggleGroup.vue` and `ToggleGroupItem` from `ToggleGroupItem.vue`. It has no default export.
- `UIToggleGroup` accepts the Reka UI root props `as`, `asChild`, `defaultValue`, `dir`, `disabled`, `loop`, `modelValue`, `name`, `orientation`, `required`, `rovingFocus`, and `type`.
- `as` defaults to `div`. Write `as-child` in a template to merge the group behavior into one child element. `asChild` takes precedence over `as`.
- `type="single"` permits one active item and uses one `AcceptableValue`. `type="multiple"` permits several active items and uses an `AcceptableValue[]`. The `type` prop overrides the type inferred from `modelValue` or `defaultValue`.
- `modelValue` is the controlled active value or values. Bind it with `v-model` or listen for `@update:model-value` on the group.
- `defaultValue` sets the initial active value or values for uncontrolled use. Write it as `default-value` in a template. Later changes to `default-value` do not control the group.
- The root emits `update:modelValue` with an `AcceptableValue` or `AcceptableValue[]` payload. The item has no separate selection event.
- `orientation` accepts `"horizontal"` or `"vertical"`. Horizontal groups use left and right arrows for movement. Vertical groups use up and down arrows.
- `rovingFocus` defaults to `true` and lets arrow keys move focus among items. Set `:roving-focus="false"` when the group must not manage arrow-key focus.
- `loop` defaults to `true`. When roving focus is enabled, arrow navigation wraps from the last item to the first and from the first item to the last. Set `:loop="false"` to stop at the ends.
- `disabled` defaults to `false` and disables the group and every item in it. An item can set its own `disabled` prop without disabling the rest of the group.
- `name` and `required` are forwarded for form use. `dir` accepts `"ltr"` or `"rtl"` when reading direction changes arrow-key behavior.
- The root also accepts `variant`, `size`, `spacing`, and `class`. `variant` accepts `"default"` or `"outline"`. `size` accepts `"default"`, `"sm"`, or `"lg"`. `spacing` accepts a number and defaults to `0`.
- The group provides `variant`, `size`, and `spacing` to its items. Group-level `variant` and `size` take precedence over the same props on an item. The item calls the shared `toggleVariants` definition from `../toggle/index.ts`, whose defaults are `default` for both values.
- `spacing` set to `0` joins neighboring items and applies group edge rounding. A positive `spacing` value creates a gap through the root `--gap` style. Pass `class` to either component for additional classes.
- `UIToggleGroupItem` requires a unique `value` of type `AcceptableValue`. Reka UI uses the value to update the group's scalar or array selection.
- An item accepts the Reka UI props `as`, `asChild`, `disabled`, and `value`, plus the local `variant`, `size`, and `class` props. `as` defaults to `button`.
- The item has no `icon` size. Use `default`, `sm`, or `lg` and put an icon in the default slot when needed.
- The item default slot receives `modelValue` as a boolean, `state` as `"on"` or `"off"`, `pressed` as a boolean, and `disabled` as a boolean. The group root slot receives the current `modelValue`.
- The wrappers forward Reka UI props and emits after removing their local styling props. The root adds `data-slot="toggle-group"`, `data-size`, `data-variant`, and `data-spacing`. Each item adds `data-slot="toggle-group-item"` and receives the group styling data.
- Reka UI exposes `data-orientation="horizontal" | "vertical"` on the group and items. Items expose `data-state="on" | "off"` and `data-disabled` when disabled.
- Tab moves focus to the pressed item or the first item in the group. Space and Enter activate or deactivate the focused item. Home moves to the first item, and End moves to the last item.
- ArrowRight and ArrowDown move to the next item. ArrowLeft and ArrowUp move to the previous item, with the active orientation deciding which direction applies. `loop` controls wrapping at either end.
- Roving focus keeps the group in one Tab stop while arrow keys move between its items. Give every item an accessible name. Visible text supplies the name, while an icon-only item needs `aria-label` or `aria-labelledby`.
- Do not replace a toggle group with a `v-for` loop of `UIButton` components. A button loop creates independent stateless actions and does not provide a shared value, single or multiple selection, roving focus, or toggle state. Use `UIButton` for actions and this group for coordinated state.
- Keep each item directly inside its group. An item outside a group cannot receive the group's selection context or styling context.
- Use `v-model` when parent state owns the selection. Use `default-value` when the group only needs an initial selection. Do not mix a controlled `model-value` with `default-value` for the same state.
- The group stores its provided styling values during setup. Treat group `variant`, `size`, and `spacing` as stable configuration when child styling must stay in sync.

## Examples

### Single selection

```vue
<template>
  <UIToggleGroup type="single" aria-label="Text alignment">
    <UIToggleGroupItem value="left">Left</UIToggleGroupItem>
    <UIToggleGroupItem value="center">Center</UIToggleGroupItem>
    <UIToggleGroupItem value="right">Right</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

### Multiple selection

```vue
<template>
  <UIToggleGroup type="multiple" aria-label="Text styles">
    <UIToggleGroupItem value="bold">Bold</UIToggleGroupItem>
    <UIToggleGroupItem value="italic">Italic</UIToggleGroupItem>
    <UIToggleGroupItem value="underline">Underline</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

### Outline

```vue
<template>
  <UIToggleGroup type="multiple" variant="outline" aria-label="Text styles">
    <UIToggleGroupItem value="bold">Bold</UIToggleGroupItem>
    <UIToggleGroupItem value="italic">Italic</UIToggleGroupItem>
    <UIToggleGroupItem value="underline">Underline</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

### Vertical

```vue
<template>
  <UIToggleGroup type="single" orientation="vertical" aria-label="Text alignment">
    <UIToggleGroupItem value="top">Top</UIToggleGroupItem>
    <UIToggleGroupItem value="middle">Middle</UIToggleGroupItem>
    <UIToggleGroupItem value="bottom">Bottom</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

### Disabled items

```vue
<template>
  <UIToggleGroup type="multiple" aria-label="Export formats">
    <UIToggleGroupItem value="pdf">PDF</UIToggleGroupItem>
    <UIToggleGroupItem value="csv" disabled>CSV</UIToggleGroupItem>
    <UIToggleGroupItem value="json" disabled>JSON</UIToggleGroupItem>
  </UIToggleGroup>
</template>
```

## References

- [Local group implementation](./ToggleGroup.vue)
- [Local item implementation](./ToggleGroupItem.vue)
- [Local exports](./index.ts)
- [Toggle](../toggle/AGENTS.md) for the shared variants and standalone two-state control
- [Button](../button/AGENTS.md) for stateless actions
- [shadcn-vue Toggle Group documentation](https://shadcn-vue.com/docs/components/toggle-group)
- [Reka UI Toggle Group documentation](https://reka-ui.com/docs/components/toggle-group)
- [WAI-ARIA roving tabindex guidance](https://www.w3.org/TR/wai-aria-practices-1.2/examples/radio/radio.html)
