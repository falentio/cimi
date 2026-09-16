# Field

Composes labels, controls, help text, and errors into accessible form fields and grouped inputs.

## Conclusion

Treat `Field` as the unit for one control: it holds the label, the control itself, and optional description and error. `FieldGroup` and `FieldSet` provide layout and semantics, so reach for them instead of raw `div`s around your fields. Only `Field` is mandatory; every other part is optional and added per field. The one gotcha that bites: put `data-invalid` on `Field` for the block-level error styling and add `aria-invalid` on the control itself for assistive tech, since neither sets the other.

## Usage

```vue
<template>
  <UIFieldSet>
    <UIFieldLegend>Profile</UIFieldLegend>
    <UIFieldDescription>This appears on invoices and emails.</UIFieldDescription>
    <UIFieldGroup>
      <UIField>
        <UIFieldLabel for="name">Full name</UIFieldLabel>
        <UIInput id="name" placeholder="Evil Rabbit" />
        <UIFieldDescription>This appears on invoices and emails.</UIFieldDescription>
      </UIField>
      <UIField orientation="horizontal">
        <UISwitch id="newsletter" />
        <UIFieldLabel for="newsletter">Subscribe to the newsletter</UIFieldLabel>
      </UIField>
    </UIFieldGroup>
  </UIFieldSet>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIField>` and its siblings in templates with no import. Controls such as `<UIInput>`, `<UITextarea>`, `<UISelect...>`, `<UICheckbox>`, `<UISwitch>`, `<UIRadioGroup...>`, and `<UIButton>` are likewise prefixed with no import.
- `fieldVariants` needs `import { fieldVariants } from '@/components/ui/field'`. The type `FieldVariants` needs `import type { FieldVariants } from '@/components/ui/field'`.
- Sub-parts: `Field`, `FieldContent`, `FieldDescription`, `FieldError`, `FieldGroup`, `FieldLabel`, `FieldLegend`, `FieldSeparator`, `FieldSet`, `FieldTitle`.
- Typical nesting: `FieldSet` > `FieldLegend` then `FieldGroup` > `Field`. Each `Field` wraps `FieldLabel`, one control, then optional `FieldDescription` and `FieldError`.
- `Field` props: `orientation`, `class`. Default orientation is `vertical`.
- `orientation` values: `vertical`, `horizontal`, `responsive`.
- `vertical` stacks label, control, and helper text in a column. Use it for mobile-first layouts and as the default.
- `horizontal` aligns the label and control side by side. Pair it with `FieldContent` when a description must stay aligned beside the control.
- `responsive` collapses to a column, then turns horizontal at the `@md/field-group` container breakpoint. It reads the container, so place the `Field` inside a `FieldGroup` and apply `@container/field-group`, which `FieldGroup` already sets.
- `FieldContent` is a flex column that groups `FieldLabel`/`FieldTitle` with `FieldDescription`. Reach for it when the label sits beside the control, as in the switch and choice-card patterns. Skip it when the field has no description.
- Put longer helper text where it should read: `FieldDescription` inside `FieldContent` groups with the label, while `FieldDescription` directly under `Field` sits under the control.
- `FieldLabel` renders a `Label` styled for both a direct input and a nested `Field`. Use it as the label for a control, or wrap a whole `Field` inside `FieldLabel` to build a selectable choice card for `RadioGroupItem`, `Checkbox`, or `Switch`.
- `FieldTitle` renders a title with label styling and belongs inside `FieldContent`. Use it when a choice card needs a heading separate from the radio or checkbox label.
- `FieldLegend` props: `variant` (`legend` or `label`, default `legend`), `class`. Use the `label` variant, which applies label sizing, when the legend sits inside a nested `FieldSet`.
- `FieldGroup` is the layout wrapper that stacks `Field` components and sets up the container query. Add `FieldSeparator` between groups to divide them.
- `FieldSeparator` draws a divider and accepts inline content in its slot. Apply it sparingly so screen readers meet clear section boundaries.
- `FieldSet` renders a `fieldset` and `FieldLegend` its `legend`, keeping related controls grouped for keyboard and assistive tech users.
- Invalid state: add `data-invalid` to `Field` to switch the whole block to the destructive text color, and add `aria-invalid` on the control for assistive technologies.
- Disabled state: `Field` styles its label and title with reduced opacity when an ancestor field carries `data-disabled=true`.
- Render `FieldError` right after the control or inside `FieldContent` so the message stays aligned with the field.
- `FieldError` accepts slot content or an `errors` prop typed `Array<string | { message: string | undefined } | undefined>`. It renders a string for a single message and a bulleted list for several, and de-duplicates repeated messages.
- Pass validator output straight to `FieldError.errors`, including `issues` arrays from Valibot. It also works with `vee-validate` error arrays.
- `Field` renders `role="group"`, so nested controls inherit labeling from `FieldLabel` and `FieldLegend`.
- Connect a label to its control with `for` on `FieldLabel` and a matching `id` on the control. This is what ties the two together for assistive tech.
- Give every control a unique `id`. Checkbox, radio, and switch rows in the docs reuse stable ids across a page for this reason.
- Only `class` is accepted alongside the documented props above. Do not fabricate props.

## Examples

```vue
<!-- Intent: a basic field with a label, control, and description -->
<template>
  <UIField>
    <UIFieldLabel for="username">Username</UIFieldLabel>
    <UIInput id="username" type="text" placeholder="Max Leiter" />
    <UIFieldDescription>Choose a unique username for your account.</UIFieldDescription>
  </UIField>
</template>
```

```vue
<!-- Intent: horizontal orientation, label beside the control -->
<template>
  <UIField orientation="horizontal">
    <UISwitch id="2fa" />
    <UIFieldLabel for="2fa">Multi-factor authentication</UIFieldLabel>
  </UIField>
</template>
```

```vue
<!-- Intent: responsive orientation, label and control stack on mobile and split on wider containers -->
<template>
  <UIFieldSet>
    <UIFieldLegend>Profile</UIFieldLegend>
    <UIFieldDescription>Fill in your profile information.</UIFieldDescription>
    <UIFieldSeparator />
    <UIFieldGroup>
      <UIField orientation="responsive">
        <UIFieldContent>
          <UIFieldLabel for="name">Name</UIFieldLabel>
          <UIFieldDescription>Provide your full name for identification</UIFieldDescription>
        </UIFieldContent>
        <UIInput id="name" placeholder="Evil Rabbit" required />
      </UIField>
    </UIFieldGroup>
  </UIFieldSet>
</template>
```

```vue
<!-- Intent: a group of fields divided by a separator -->
<template>
  <UIFieldGroup>
    <UIFieldSet>
      <UIFieldLabel>Responses</UIFieldLabel>
      <UIFieldDescription>Get notified about slow requests.</UIFieldDescription>
      <UIFieldGroup data-slot="checkbox-group">
        <UIField orientation="horizontal">
          <UICheckbox id="push" :default-value="true" />
          <UIFieldLabel for="push" class="font-normal">Push notifications</UIFieldLabel>
        </UIField>
      </UIFieldGroup>
    </UIFieldSet>
    <UIFieldSeparator />
    <UIFieldSet>
      <UIFieldLabel>Tasks</UIFieldLabel>
      <UIFieldDescription>Get notified when your tasks update.</UIFieldDescription>
      <UIFieldGroup data-slot="checkbox-group">
        <UIField orientation="horizontal">
          <UICheckbox id="email-tasks" />
          <UIFieldLabel for="email-tasks" class="font-normal">Email notifications</UIFieldLabel>
        </UIField>
      </UIFieldGroup>
    </UIFieldSet>
  </UIFieldGroup>
</template>
```

```vue
<!-- Intent: invalid state, data-invalid on Field and aria-invalid on the control -->
<template>
  <UIField data-invalid>
    <UIFieldLabel for="email">Email</UIFieldLabel>
    <UIInput id="email" type="email" aria-invalid />
    <UIFieldError>Enter a valid email address.</UIFieldError>
  </UIField>
</template>
```

```vue
<!-- Intent: pass a validator error array to FieldError -->
<script setup lang="ts">
const errors = { username: ['Choose another username.'] }
</script>

<template>
  <UIField data-invalid>
    <UIFieldLabel for="username">Username</UIFieldLabel>
    <UIInput id="username" aria-invalid />
    <UIFieldError :errors="errors.username" />
  </UIField>
</template>
```

```vue
<!-- Intent: a choice card, Field wrapped in FieldLabel -->
<script setup lang="ts">
import { ref } from 'vue'

const plan = ref('kubernetes')
</script>

<template>
  <UIFieldGroup>
    <UIFieldSet>
      <UIFieldLabel>Compute Environment</UIFieldLabel>
      <UIFieldDescription>Select the environment for your cluster.</UIFieldDescription>
      <UIRadioGroup v-model="plan">
        <UIFieldLabel for="kubernetes">
          <UIField orientation="horizontal">
            <UIFieldContent>
              <UIFieldTitle>Kubernetes</UIFieldTitle>
              <UIFieldDescription>Run GPU workloads on a K8s cluster.</UIFieldDescription>
            </UIFieldContent>
            <UIRadioGroupItem id="kubernetes" value="kubernetes" />
          </UIField>
        </UIFieldLabel>
      </UIRadioGroup>
    </UIFieldSet>
  </UIFieldGroup>
</template>
```

## References

- [Field](/home/kevin/.herdr/worktrees/cimi/feat-agents-md-ui-components/apps/web/app/components/ui/field/AGENTS.md) self.
- [Label](../label/AGENTS.md), the primitive `FieldLabel` wraps.
- [Separator](../separator/AGENTS.md), the primitive `FieldSeparator` wraps.
- [Input](../input/AGENTS.md) for text inputs.
- [Textarea](../textarea/AGENTS.md) for multi-line input.
- [Select](../select/AGENTS.md) for dropdown controls.
- [Checkbox](../checkbox/AGENTS.md) for checkbox controls.
- [Radio Group](../radio-group/AGENTS.md) for radio controls and choice cards.
- [Switch](../switch/AGENTS.md) for toggle controls.
- [Button](../button/AGENTS.md) for field actions.
- [Form](../form/AGENTS.md) for `vee-validate` integration and error arrays.
- [shadcn-vue docs](https://shadcn-vue.com/docs/components/field).
- [Standard Schema](https://standardschema.dev/) for validator output accepted by `FieldError`.
- [Tailwind container queries plugin](https://github.com/tailwindlabs/tailwindcss-container-queries) for `responsive` orientation on Tailwind v3.
