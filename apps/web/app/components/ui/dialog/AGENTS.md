# Dialog

A window overlaid on the primary window that renders the content underneath inert, for content that needs the user's attention before they continue.

## Conclusion

Reach for `Dialog` when you need a dismissible modal: it traps focus, closes on `Esc`, and closes when the user clicks outside. `Dialog` and `DialogContent` are the only mandatory parts; `DialogTrigger`, `DialogTitle`, `DialogDescription`, `DialogHeader`, and `DialogFooter` are optional, though you must always render a `DialogTitle` for accessibility. The two gotchas that bite: `DialogContent` already renders its own overlay and portal, so never add `DialogOverlay` or a portal wrapper yourself, and long content overflows the viewport, so use `DialogScrollContent` instead of `DialogContent` when the dialog can exceed screen height.

## Usage

```vue
<template>
  <UIDialog>
    <UIDialogTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UIDialogTrigger>
    <UIDialogContent>
      <UIDialogHeader>
        <UIDialogTitle>Are you absolutely sure?</UIDialogTitle>
        <UIDialogDescription> This action cannot be undone. </UIDialogDescription>
      </UIDialogHeader>
      <UIDialogFooter>
        <UIDialogClose as-child>
          <UIButton variant="outline">Cancel</UIButton>
        </UIDialogClose>
        <UIButton>Continue</UIButton>
      </UIDialogFooter>
    </UIDialogContent>
  </UIDialog>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIDialog>`, `<UIDialogTrigger>`, `<UIDialogContent>`, `<UIDialogScrollContent>`, `<UIDialogHeader>`, `<UIDialogFooter>`, `<UIDialogTitle>`, `<UIDialogDescription>`, `<UIDialogClose>`, and `<UIDialogOverlay>` in templates with no import.
- The folder is `@/components/ui/dialog`. `index.ts` exports `Dialog`, `DialogClose`, `DialogContent`, `DialogDescription`, `DialogFooter`, `DialogHeader`, `DialogOverlay`, `DialogScrollContent`, `DialogTitle`, `DialogTrigger`.
- Every export is a Vue component with a default export, so each is auto-imported by its `UI`-prefixed name. No lowercase helper, type-only, or non-component exports exist here, so no explicit import from `@/components/ui/dialog` is ever needed.
- Required nesting: `Dialog` wraps everything, `DialogTrigger` and `DialogContent` are its direct children, and `DialogTitle` and `DialogDescription` sit inside `DialogContent`.
- `Dialog` forwards all `DialogRootProps` and `DialogRootEmits` from reka-ui. Props: `open`, `defaultOpen`, `modal` (default `true`), `unmountOnHide` (default `true`). Events: `update:open`. Slot props: `open` and `close`. Bind `v-model:open` to control visibility; leave it off for uncontrolled use.
- `DialogTrigger` forwards `DialogTriggerProps`. Its default element is `as` `'button'`. Set `as-child` to wrap a `UIButton` or any element instead of rendering its own `<button>`.
- `DialogContent` forwards `DialogContentProps` and `DialogContentEmits`, plus local `class` and `showCloseButton` (default `true`). It renders `DialogPortal` and `DialogOverlay` internally, so never add them.
- `DialogContent` events: `closeAutoFocus`, `escapeKeyDown`, `focusOutside`, `interactOutside`, `openAutoFocus`, `pointerDownOutside`. Each is preventable with `event.preventDefault()`.
- `showCloseButton` on `DialogContent` toggles the built-in top-right close button, which is a `UIButton variant="ghost" size="icon-sm"` with an `sr-only` "Close" label. Set it to `false` when you supply your own close control.
- `DialogScrollContent` forwards `DialogContentProps` and `DialogContentEmits`, plus local `class`. It renders `DialogPortal` and centers `DialogContent` inside a scrollable `DialogOverlay`, and it always renders its own close button, so there is no `showCloseButton` prop.
- `DialogScrollContent` includes the reka-ui scrollbar guard on `@pointer-down-outside`, so clicking the scrollbar keeps the dialog open.
- `DialogHeader` and `DialogFooter` accept only `class` and render plain `div` wrappers. `DialogFooter` also accepts `showCloseButton` (default `false`), which appends a `UIButton variant="outline"` close button.
- `DialogFooter` reverses to a column on narrow screens. List the confirming action last in source so it lands on the correct visual side.
- `DialogTitle` forwards `DialogTitleProps` plus `class` and renders an `<h2>` by default. It supplies the accessible name. `DialogDescription` forwards `DialogDescriptionProps` plus `class` and renders a `<p>` by default.
- Always render `DialogTitle`. To hide it visually, wrap it in the Visually Hidden utility with `as-child`.
- `DialogDescription` supplies the accessible description. To omit it entirely, drop the part and pass `:aria-describedby="undefined"` to `DialogContent`. To hide it visually, wrap it in the Visually Hidden utility with `as-child`.
- `DialogClose` forwards `DialogCloseProps`. Its default element is `as` `'button'`. Set `as-child` to wrap a `UIButton` or any element; clicking it closes the dialog.
- `DialogOverlay` forwards `DialogOverlayProps` plus `class`. `DialogContent` and `DialogScrollContent` already render it, so reach for it only inside a custom content component.
- Focus is trapped inside while open, and the rest of the page stays inert. `Esc` closes the dialog and returns focus to the trigger. `Tab` cycles within the dialog.
- To nest a `Dialog` inside a `Context Menu` or `Dropdown Menu`, wrap the menu component in the `Dialog` so `DialogContent` can portal above the menu layer.

## Examples

```vue
<!-- Intent: minimal controlled dialog with a trigger -->
<template>
  <UIDialog>
    <UIDialogTrigger>Open</UIDialogTrigger>
    <UIDialogContent>
      <UIDialogHeader>
        <UIDialogTitle>Are you absolutely sure?</UIDialogTitle>
        <UIDialogDescription> This action cannot be undone. </UIDialogDescription>
      </UIDialogHeader>
    </UIDialogContent>
  </UIDialog>
</template>
```

```vue
<!-- Intent: dialog with form inputs, cancel via DialogClose, submit button -->
<template>
  <UIDialog>
    <form>
      <UIDialogTrigger as-child>
        <UIButton variant="outline">Edit profile</UIButton>
      </UIDialogTrigger>
      <UIDialogContent class="sm:max-w-[425px]">
        <UIDialogHeader>
          <UIDialogTitle>Edit profile</UIDialogTitle>
          <UIDialogDescription> Make changes to your profile here. </UIDialogDescription>
        </UIDialogHeader>
        <div class="grid gap-4">
          <div class="grid gap-3">
            <UILabel for="name">Name</UILabel>
            <UIInput id="name" default-value="Pedro Duarte" />
          </div>
          <div class="grid gap-3">
            <UILabel for="username">Username</UILabel>
            <UIInput id="username" default-value="@peduarte" />
          </div>
        </div>
        <UIDialogFooter>
          <UIDialogClose as-child>
            <UIButton variant="outline">Cancel</UIButton>
          </UIDialogClose>
          <UIButton type="submit">Save changes</UIButton>
        </UIDialogFooter>
      </UIDialogContent>
    </form>
  </UIDialog>
</template>
```

```vue
<!-- Intent: custom close button by disabling the built-in one -->
<template>
  <UIDialog>
    <UIDialogTrigger as-child>
      <UIButton variant="outline">Share</UIButton>
    </UIDialogTrigger>
    <UIDialogContent class="sm:max-w-md" :show-close-button="false">
      <UIDialogHeader>
        <UIDialogTitle>Share link</UIDialogTitle>
        <UIDialogDescription>
          Anyone who has this link will be able to view this.
        </UIDialogDescription>
      </UIDialogHeader>
      <UIDialogFooter class="sm:justify-start">
        <UIDialogClose as-child>
          <UIButton type="button" variant="secondary">Close</UIButton>
        </UIDialogClose>
      </UIDialogFooter>
    </UIDialogContent>
  </UIDialog>
</template>
```

```vue
<!-- Intent: scrollable dialog for content taller than the viewport -->
<template>
  <UIDialog>
    <UIDialogTrigger as-child>
      <UIButton variant="outline">Terms</UIButton>
    </UIDialogTrigger>
    <UIDialogScrollContent class="sm:max-w-lg">
      <UIDialogHeader>
        <UIDialogTitle>Terms of service</UIDialogTitle>
        <UIDialogDescription> Review the full agreement before continuing. </UIDialogDescription>
      </UIDialogHeader>
      <p v-for="n in 40" :key="n">Paragraph {{ n }} of the agreement.</p>
      <UIDialogFooter>
        <UIDialogClose as-child>
          <UIButton variant="outline">Close</UIButton>
        </UIDialogClose>
        <UIButton>Accept</UIButton>
      </UIDialogFooter>
    </UIDialogScrollContent>
  </UIDialog>
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
  <UIDialog v-model:open="open">
    <UIDialogTrigger>Open</UIDialogTrigger>
    <UIDialogContent>
      <UIDialogTitle>Submit</UIDialogTitle>
      <form
        @submit.prevent="
          () => {
            wait().then(() => (open = false))
          }
        "
      >
        <button type="submit">Submit</button>
      </form>
    </UIDialogContent>
  </UIDialog>
</template>
```

```vue
<!-- Intent: nest a dialog inside a context menu -->
<template>
  <UIDialog>
    <UIContextMenu>
      <UIContextMenuTrigger>Right click</UIContextMenuTrigger>
      <UIContextMenuContent>
        <UIContextMenuItem>Open</UIContextMenuItem>
        <UIDialogTrigger as-child>
          <UIContextMenuItem>Delete</UIContextMenuItem>
        </UIDialogTrigger>
      </UIContextMenuContent>
    </UIContextMenu>
    <UIDialogContent>
      <UIDialogHeader>
        <UIDialogTitle>Are you absolutely sure?</UIDialogTitle>
        <UIDialogDescription> This will permanently delete the file. </UIDialogDescription>
      </UIDialogHeader>
      <UIDialogFooter>
        <UIButton type="submit">Confirm</UIButton>
      </UIDialogFooter>
    </UIDialogContent>
  </UIDialog>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/dialog)
- [Alert Dialog](../alert-dialog/AGENTS.md) for a modal that blocks dismiss and forces an explicit choice
- [Button](../button/AGENTS.md) for the `variant` and `size` values used by triggers and close buttons
- [Drawer](../drawer/AGENTS.md) for a bottom sheet on small viewports
- [Context Menu](../context-menu/AGENTS.md) for the nesting pattern
- [Dropdown Menu](../dropdown-menu/AGENTS.md) for the nesting pattern
- [Input](../input/AGENTS.md) for form fields inside a dialog
- [Label](../label/AGENTS.md) for labeling dialog form fields
- [Reka UI Dialog](https://reka-ui.com/docs/components/dialog) for all forwarded props, emits, and data attributes
