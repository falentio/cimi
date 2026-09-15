# Alert Dialog

A modal dialog that interrupts the user with important content and expects a response, unlike `Dialog` which is dismissible and less forceful.

## Conclusion

Reach for `Alert Dialog` when the user must confirm or reject a consequential action, since it blocks interaction, traps focus, and requires an explicit choice. It is composed of mandatory parts, so `AlertDialog`, `AlertDialogContent`, `AlertDialogTitle`, and either an `AlertDialogAction` or `AlertDialogCancel` must all be present. The one gotcha: `AlertDialogContent` renders its own portal and overlay, so never add `AlertDialogPortal` or `AlertDialogOverlay` yourself, and always give the dialog an accessible name via `AlertDialogTitle` or `aria-label`.

## Usage

```vue
<template>
  <UIAlertDialog>
    <UIAlertDialogTrigger as-child>
      <UIButton variant="outline">Show Dialog</UIButton>
    </UIAlertDialogTrigger>
    <UIAlertDialogContent>
      <UIAlertDialogHeader>
        <UIAlertDialogTitle>Are you absolutely sure?</UIAlertDialogTitle>
        <UIAlertDialogDescription> This action cannot be undone. </UIAlertDialogDescription>
      </UIAlertDialogHeader>
      <UIAlertDialogFooter>
        <UIAlertDialogCancel>Cancel</UIAlertDialogCancel>
        <UIAlertDialogAction>Continue</UIAlertDialogAction>
      </UIAlertDialogFooter>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIAlertDialog>`, `<UIAlertDialogTrigger>`, `<UIAlertDialogContent>`, and the other parts in templates with no import.
- The component folder is `@/components/ui/alert-dialog`. It exports `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogMedia`, `AlertDialogTitle`, `AlertDialogTrigger`.
- Required nesting and order: `AlertDialog` wraps everything, `AlertDialogTrigger` and `AlertDialogContent` are its direct children, and `AlertDialogHeader` and `AlertDialogFooter` sit inside `AlertDialogContent`.
- `AlertDialog` forwards all `AlertDialogProps` and `AlertDialogEmits` from reka-ui, so `v-model:open` controls visibility and `open` defaults to uncontrolled.
- `AlertDialogTrigger` forwards `AlertDialogTriggerProps`. Set `as-child` to wrap a `Button` or any element instead of rendering its own `<button>`.
- `AlertDialogContent` forwards `AlertDialogContentProps` and `AlertDialogContentEmits`, plus local `class` and `size`. It already includes the portal and overlay, so do not add them.
- `size` values for `AlertDialogContent`: `default`, `sm`. Defaults to `default`.
- `AlertDialogAction` and `AlertDialogCancel` forward `AlertDialogActionProps` and `AlertDialogCancelProps`. Both accept `variant` and `size` typed as `ButtonVariants`, plus `class`.
- `variant` is `default` on `AlertDialogAction` and `outline` on `AlertDialogCancel`. `size` defaults to `default` on both. Values match the `Button` component enumerations.
- `AlertDialogAction` closes the dialog and confirms. `AlertDialogCancel` closes it without confirming. Give them visually distinct variants so users cannot misclick.
- `AlertDialogHeader`, `AlertDialogFooter`, and `AlertDialogMedia` accept only `class` and render plain `div` wrappers.
- `AlertDialogTitle` and `AlertDialogDescription` forward their reka-ui props plus `class`. `AlertDialogTitle` supplies the accessible name and `AlertDialogDescription` the accessible description.
- Provide only `AlertDialogTitle` or only `aria-label` on `AlertDialogContent` for the name, and `AlertDialogDescription` or `aria-describedby` for the description. Never omit both forms.
- `AlertDialogMedia` renders an icon or image block inside the header and adjusts header layout automatically when present.
- Place `AlertDialogFooter` after `AlertDialogHeader`. Its column order reverses on narrow screens, so list the action last in source for correct visual order.
- `Esc` closes the dialog and returns focus to the trigger. `Space` and `Enter` activate the focused trigger or button.
- Focus is trapped inside and the underlying page is inert while open. The overlay is not dismissible by click, unlike `Dialog`.

## Examples

```vue
<!-- Intent: confirm a destructive action with distinct action and cancel buttons -->
<template>
  <UIAlertDialog>
    <UIAlertDialogTrigger as-child>
      <UIButton variant="outline">Delete account</UIButton>
    </UIAlertDialogTrigger>
    <UIAlertDialogContent>
      <UIAlertDialogHeader>
        <UIAlertDialogTitle>Are you absolutely sure?</UIAlertDialogTitle>
        <UIAlertDialogDescription>
          This action cannot be undone. This will permanently delete your account.
        </UIAlertDialogDescription>
      </UIAlertDialogHeader>
      <UIAlertDialogFooter>
        <UIAlertDialogCancel>Cancel</UIAlertDialogCancel>
        <UIAlertDialogAction variant="destructive">Delete</UIAlertDialogAction>
      </UIAlertDialogFooter>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
```

```vue
<!-- Intent: control open state and close after an async submission -->
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
const wait = () => new Promise((resolve) => setTimeout(resolve, 1000))
</script>

<template>
  <UIAlertDialog v-model:open="open">
    <UIAlertDialogTrigger>Open</UIAlertDialogTrigger>
    <UIAlertDialogContent>
      <UIAlertDialogTitle>Confirm</UIAlertDialogTitle>
      <form
        @submit.prevent="
          () => {
            wait().then(() => (open = false))
          }
        "
      >
        <button type="submit">Submit</button>
      </form>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
```

```vue
<!-- Intent: compact small dialog with an icon in the header -->
<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue'
</script>

<template>
  <UIAlertDialog>
    <UIAlertDialogTrigger>Open</UIAlertDialogTrigger>
    <UIAlertDialogContent size="sm">
      <UIAlertDialogHeader>
        <UIAlertDialogMedia>
          <TriangleAlertIcon />
        </UIAlertDialogMedia>
        <UIAlertDialogTitle>Discard changes?</UIAlertDialogTitle>
        <UIAlertDialogDescription> Your edits will be lost. </UIAlertDialogDescription>
      </UIAlertDialogHeader>
      <UIAlertDialogFooter>
        <UIAlertDialogCancel>Keep editing</UIAlertDialogCancel>
        <UIAlertDialogAction>Discard</UIAlertDialogAction>
      </UIAlertDialogFooter>
    </UIAlertDialogContent>
  </UIAlertDialog>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/alert-dialog)
- [Button](../button/AGENTS.md) for the `variant` and `size` values reused by action and cancel
- [Dialog](../dialog/AGENTS.md) for non-blocking, dismissible modals
- [Reka UI Alert Dialog](https://reka-ui.com/docs/components/alert-dialog) for all forwarded props, emits, and data attributes
