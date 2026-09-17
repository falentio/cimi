# Form

Accessible vee-validate form fields with schema validation and automatic ARIA wiring, for any form that needs typed validation and inline errors.

## Conclusion

This directory re-exports `vee-validate` primitives: `Form`, `Field as FormField`, `FieldArray as FormFieldArray`, and adds five layout components (`FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`). Reach for the pairing `FormField` + `FormItem` + `FormControl` + `FormMessage`, where `FormField` holds the field name and slot props, and `FormItem` provides the id that the rest of the children read. The one gotcha is that `FormControl` must wrap the single input element so it can inject `id`, `aria-invalid`, and `aria-describedby`, and `FormMessage` reads the current field's errors through that same context, so it must sit inside `FormField` and `FormItem`.

## Usage

```vue
<template>
  <form @submit="onSubmit">
    <UIFormField v-slot="{ componentField }" name="username">
      <UIFormItem>
        <UIFormLabel>Username</UIFormLabel>
        <UIFormControl>
          <UIInput placeholder="shadcn" v-bind="componentField" />
        </UIFormControl>
        <UIFormDescription>This is your public display name.</UIFormDescription>
        <UIFormMessage />
      </UIFormItem>
    </UIFormField>
    <UIButton type="submit">Submit</UIButton>
  </form>
</template>
```

## Meaningful Information

- `index.ts` exports `FormControl`, `FormDescription`, `FormItem`, `FormLabel`, `FormMessage`, `FORM_ITEM_INJECTION_KEY`, `Form`, `FormField` (alias `Field`), `FormFieldArray` (alias `FieldArray`).
- `Form` and `FormField` and `FormFieldArray` come straight from `vee-validate`, so every `vee-validate` prop (`name`, `type`, `validateOnInput`, `as`, slot props) works unchanged.
- Required nesting: `FormField` wraps `FormItem`, and `FormItem` wraps `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`.
- `FormField` requires a `name` matching a key in the schema. Bind `v-bind="componentField"` when the control is a Vue component with `v-model` (as `UIInput`, `UISelect`, `UICheckbox`), because `componentField` carries `modelValue`, `update:modelValue`, and `name`.
- `FormItem` generates one id via `useId()` and provides it through `FORM_ITEM_INJECTION_KEY`, so all ids and ARIA links stay consistent.
- `FormControl` renders a Reka `Slot` and forwards `id`, `aria-describedby`, and `aria-invalid` onto its single child, so it must wrap exactly one input and no wrapper element.
- `FormLabel` sets `for` to the control id and toggles `data-error` styling from the field error state.
- `FormMessage` renders vee-validate `ErrorMessage` as a `<p>` with the field name and `formMessageId`, and shows nothing when there is no error.
- `useFormField()` returns `id`, `name`, `formItemId`, `formDescriptionId`, `formMessageId`, `valid`, `isDirty`, `isTouched`, `error`. It throws outside `FormField`, and it is the only source for `FormMessage` errors.
- Build the form with `useForm({ validationSchema, initialValues })` from `vee-validate`; submit through `handleSubmit`.
- Use `setFieldError` in the `handleSubmit` callback to map a server error to one field. `FormMessage` renders the error, and `FormControl` updates the field's ARIA attributes.
- Validate with any Standard Schema library: wrap a zod schema with `toTypedSchema` from `@vee-validate/zod`, or pass a valibot or yup schema.
- `initialValues` must match the schema keys so typed inputs render their starting values.
- Accessibility is automatic: `FormControl` sets `aria-invalid` from the error and appends `formMessageId` to `aria-describedby` only when an error exists, and `FormDescription` owns `formDescriptionId`.

## Examples

```vue
<!-- Minimal zod-validated field -->
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const formSchema = toTypedSchema(
  z.object({
    username: z.string().min(2, 'Username must be at least 2 characters.').max(50),
  }),
)

const form = useForm({ validationSchema: formSchema, initialValues: { username: '' } })
const onSubmit = form.handleSubmit((values) => {
  console.log(values)
})
</script>

<template>
  <form class="w-2/3 space-y-6" @submit="onSubmit">
    <UIFormField v-slot="{ componentField }" name="username">
      <UIFormItem>
        <UIFormLabel>Username</UIFormLabel>
        <UIFormControl>
          <UIInput type="text" placeholder="shadcn" v-bind="componentField" />
        </UIFormControl>
        <UIFormDescription>This is your public display name.</UIFormDescription>
        <UIFormMessage />
      </UIFormItem>
    </UIFormField>
    <UIButton type="submit">Submit</UIButton>
  </form>
</template>
```

Use `setFieldError` when an API response rejects one field. This example uses a local condition in place of the API response.

```vue
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const formSchema = toTypedSchema(
  z.object({
    username: z.string().min(2, 'Username must be at least 2 characters.'),
  }),
)

const form = useForm({ validationSchema: formSchema, initialValues: { username: '' } })
const onSubmit = form.handleSubmit((values, { setFieldError }) => {
  if (values.username === 'shadcn') {
    setFieldError('username', 'This username is already taken.')
    return
  }

  console.log(values)
})
</script>

<template>
  <form @submit="onSubmit">
    <UIFormField v-slot="{ componentField }" name="username">
      <UIFormItem>
        <UIFormLabel>Username</UIFormLabel>
        <UIFormControl>
          <UIInput placeholder="shadcn" v-bind="componentField" />
        </UIFormControl>
        <UIFormMessage />
      </UIFormItem>
    </UIFormField>
    <UIButton type="submit">Save</UIButton>
  </form>
</template>
```

```vue
<!-- Checkbox field holding a string array -->
<script setup lang="ts">
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const tasks = [
  { id: 'push', label: 'Push notifications' },
  { id: 'email', label: 'Email notifications' },
] as const

const formSchema = toTypedSchema(
  z.object({
    tasks: z.array(z.string()).min(1, 'Please select at least one notification type.'),
  }),
)

const form = useForm({ validationSchema: formSchema, initialValues: { tasks: [] } })
const onSubmit = form.handleSubmit((values) => {
  console.log(values)
})
</script>

<template>
  <form @submit="onSubmit">
    <UIFormField v-slot="{ value, handleChange }" name="tasks">
      <UIFormItem>
        <UIFormLabel>Tasks</UIFormLabel>
        <div v-for="task in tasks" :key="task.id" class="flex items-center gap-2">
          <UIFormControl>
            <UICheckbox
              :model-value="value?.includes(task.id)"
              @update:model-value="
                (checked: boolean | 'indeterminate') => {
                  handleChange(
                    checked
                      ? [...(value || []), task.id]
                      : (value || []).filter((id: string) => id !== task.id),
                  )
                }
              "
            />
          </UIFormControl>
          <UIFormLabel class="font-normal">{{ task.label }}</UIFormLabel>
        </div>
        <UIFormMessage />
      </UIFormItem>
    </UIFormField>
    <UIButton type="submit">Save</UIButton>
  </form>
</template>
```

```vue
<!-- Select field -->
<template>
  <UIFormField v-slot="{ componentField }" name="language">
    <UIFormItem>
      <UIFormLabel>Spoken Language</UIFormLabel>
      <UISelect v-bind="componentField">
        <UISelectTrigger>
          <UISelectValue placeholder="Select" />
        </UISelectTrigger>
        <UISelectContent>
          <UISelectItem value="en">English</UISelectItem>
          <UISelectItem value="es">Spanish</UISelectItem>
        </UISelectContent>
      </UISelect>
      <UIFormDescription>For best results, select the language you speak.</UIFormDescription>
      <UIFormMessage />
    </UIFormItem>
  </UIFormField>
</template>
```

## References

- [Form component docs](https://shadcn-vue.com/docs/components/form)
- [VeeValidate forms guide](https://shadcn-vue.com/docs/forms/vee-validate)
- [vee-validate Field API](https://vee-validate.logaretm.com/v4/api/field)
- [Zod](https://zod.dev)
- [Form AGENTS.md](/home/kevin/.herdr/worktrees/cimi/feat-agents-md-ui-components/apps/web/app/components/ui/form/AGENTS.md)
- [Input](../input/AGENTS.md)
- [Select](../select/AGENTS.md)
- [Checkbox](../checkbox/AGENTS.md)
- [Button](../button/AGENTS.md)
