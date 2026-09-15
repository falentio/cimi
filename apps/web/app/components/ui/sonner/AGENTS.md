# Sonner

Provides a Nuxt auto-imported toast host backed by `vue-sonner` for short-lived status, progress, and action messages.

## Conclusion

Mount one `<UIToaster>` near the app root, then call the explicitly imported `toast` helper from any client-side component. The local barrel exports `Toaster`, not `Sonner`, so `<UISonner>` is not a valid tag. The wrapper supplies the app theme variables, rounded toast styling, and Hugeicons icons while forwarding the upstream `ToasterProps`.

## Usage

Mount `<UIToaster>` once in `app.vue` or the layout that owns the whole app. Import the stylesheet once because the local wrapper does not import it.

```vue
<script setup lang="ts">
import 'vue-sonner/style.css'
import { toast } from 'vue-sonner'

function showToast() {
  toast('Event has been created')
}
</script>

<template>
  <div>
    <button type="button" @click="showToast">Show toast</button>
    <UIToaster />
  </div>
</template>
```

`shadcn-nuxt` uses the `UI` prefix from `apps/web/nuxt.config.ts` and scans `@/components/ui`. Use `<UIToaster>` in templates without importing the component. Import lowercase helpers and type-only symbols explicitly from `vue-sonner`. `toast.promise` is a method on the imported `toast` object, not a separate named import.

## Meaningful Information

- `index.ts` exports only `Toaster` from `./Sonner.vue`. The correct auto-imported tag is `<UIToaster>`. Do not use `<UISonner>`.
- `Sonner.vue` accepts `ToasterProps` from `vue-sonner` and forwards the upstream toaster configuration. `ToasterProps` is a type-only import from `vue-sonner`, not from the local barrel.
- The wrapper applies `toaster group` to the toaster, maps normal toast colors to the app's popover and border variables, and gives toasts a `rounded-2xl` class when `toastOptions` is omitted.
- Passing `toastOptions` replaces that local default object. Merge `classes.toast` yourself when you need both custom options and the default rounded class.
- The wrapper supplies Hugeicons for success, info, warning, error, loading, and close states. The loading icon spins. Parent slots do not override these icons because the wrapper defines the icon templates itself.
- The toaster positions toasts at `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, or `bottom-right`. The locked `vue-sonner` v2.0.9 package defaults to `bottom-right`.
- `theme` accepts `light`, `dark`, or `system` and defaults to `light`. `system` follows the browser color-scheme preference after hydration.
- `richColors` adds type-specific colors for success, info, warning, and error toasts. The local normal colors still use the app's popover variables.
- `duration` is measured in milliseconds. The current default is 4000 milliseconds. Set it on `<UIToaster>` for a global default or in a toast options object for one toast. Use `Infinity` to keep a toast open.
- Toast timers pause while the toast is expanded, while the user interacts with the toaster, or while the document is hidden. Loading toasts and promise toasts in their loading state do not auto-close.
- `closeButton` adds a close button to ordinary toasts. The button does not render for loading toasts. The default accessible label is `Close toast`, and `toastOptions.closeButtonAriaLabel` changes it.
- Toasts are dismissible by the close button, a permitted swipe, or `toast.dismiss(id)`. Set `dismissible: false` on a toast to disable its close and swipe behavior. `toast.dismiss()` dismisses every toast.
- The toast types are the default type plus `success`, `info`, `warning`, `error`, and `loading`. Use `toast.success`, `toast.info`, `toast.warning`, `toast.error`, or `toast.loading` for the named types.
- `toast.promise` accepts a promise or a promise factory. It can show `loading`, then replace that toast with `success` or `error`. Success and error messages can be functions that receive the settled value or error.
- A toast title can be a string or a Vue component. `description` accepts the same forms and renders below the title.
- `action` and `cancel` add buttons. Each can be a label with an `onClick` handler or a Vue component. An action closes the toast unless its handler calls `event.preventDefault()`. A cancel action closes a dismissible toast after its handler runs.
- `onDismiss` runs when the user closes or swipes a toast and when the toaster processes a dismissal. `onAutoClose` runs after a duration timeout. These are toast option callbacks, not `<UIToaster>` events.
- `<UIToaster>` has no `v-model` and exposes no public component events. Control toast state through `toast` methods and per-toast callbacks.
- The toaster renders an `aria-live="polite"` region with the configurable `containerAriaLabel`, which defaults to `Notifications`. Keep toast titles and descriptions meaningful because icons do not replace text for assistive technology.
- The upstream toaster supports keyboard focus with `Alt+T`. Set the `hotkey` prop to an array of keyboard modifier names or `event.code` values when the default conflicts with the app.
- The upstream component guards `window`, `document`, and system-theme listeners during SSR. Render `<UIToaster>` during SSR, but call `toast` from client-side handlers or client lifecycle code rather than during server setup.
- A toast emitted before the toaster subscribes has no mounted UI to receive it. Mount `<UIToaster>` before code can emit startup notifications.
- The local `Sonner.vue` file and `apps/web/app/assets/css/tailwind.css` do not import `vue-sonner/style.css`. Add `import 'vue-sonner/style.css'` to an app-level entry when the stylesheet is not already loaded.
- Do not add the `vue-sonner/nuxt` module for this component. This app uses the local shadcn wrapper and explicit `toast` imports instead of the module's `$toast` injection.

## Examples

Use the named helpers for status-specific icons and `toast.promise` for work that has a real promise lifecycle.

```vue
<script setup lang="ts">
import 'vue-sonner/style.css'
import { toast } from 'vue-sonner'

function createEvent() {
  toast.promise<{ name: string }>(
    () =>
      new Promise((resolve) => {
        setTimeout(() => resolve({ name: 'Event' }), 1000)
      }),
    {
      loading: 'Creating event...',
      success: (data) => `${data.name} has been created`,
      error: 'Could not create the event',
    },
  )
}
</script>

<template>
  <div>
    <button type="button" @click="toast.success('The event is ready')">
      Show success
    </button>
    <button type="button" @click="toast.error('The event failed')">
      Show error
    </button>
    <button type="button" @click="createEvent">Create event</button>
    <UIToaster position="top-center" theme="system" rich-colors />
  </div>
</template>
```

Add a description, an action, and a cancel button through the toast options object.

```vue
<script setup lang="ts">
import 'vue-sonner/style.css'
import { toast } from 'vue-sonner'

function notify() {
  toast('Event has been created', {
    description: 'Sunday, December 03, 2023 at 9:00 AM',
    action: {
      label: 'Undo',
      onClick: () => toast('Event restored'),
    },
    cancel: {
      label: 'Dismiss',
      onClick: () => undefined,
    },
    duration: 10000,
  })
}
</script>

<template>
  <div>
    <button type="button" @click="notify">Show details</button>
    <UIToaster close-button />
  </div>
</template>
```

Keep a loading toast open until the operation completes, then update it by reusing its id.

```vue
<script setup lang="ts">
import 'vue-sonner/style.css'
import { toast } from 'vue-sonner'

async function save() {
  const id = toast.loading('Saving changes...')

  await new Promise((resolve) => setTimeout(resolve, 1000))
  toast.success('Changes saved', { id })
}
</script>

<template>
  <div>
    <button type="button" @click="save">Save</button>
    <UIToaster />
  </div>
</template>
```

## References

- [Local export](./index.ts)
- [Local wrapper](./Sonner.vue)
- [Nuxt configuration](../../../../nuxt.config.ts)
- [shadcn-vue Sonner documentation](https://shadcn-vue.com/docs/components/sonner)
- [Vue Sonner documentation](https://vue-sonner.vercel.app/)
- [Vue Sonner README](https://github.com/xiaoluoboding/vue-sonner#readme)
- [Vue Sonner types](https://github.com/xiaoluoboding/vue-sonner/blob/main/src/packages/types.ts)
