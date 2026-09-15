# Sheet

A Sheet is a Dialog-based panel that slides in from a screen edge to show content alongside the current page.

## Conclusion

Use `Sheet` for a dismissible edge panel that needs modal behavior, keyboard support, and accessible dialog semantics. `Sheet` and `SheetContent` are the required parts. Add `SheetTrigger` to open it from a control, `SheetHeader` with `SheetTitle` and `SheetDescription` for its heading, and `SheetFooter` with `SheetClose` for actions. `SheetContent` already renders the portal, overlay, and close button, so do not add those parts around it.

## Usage

Use the `UI`-prefixed auto-imports in Nuxt templates. The common composition is:

```vue
<template>
  <UISheet>
    <UISheetTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UISheetTrigger>
    <UISheetContent>
      <UISheetHeader>
        <UISheetTitle>Edit profile</UISheetTitle>
        <UISheetDescription>
          Make changes to your profile here.
        </UISheetDescription>
      </UISheetHeader>
      <UISheetFooter>
        <UISheetClose as-child>
          <UIButton variant="outline">Close</UIButton>
        </UISheetClose>
        <UIButton>Save changes</UIButton>
      </UISheetFooter>
    </UISheetContent>
  </UISheet>
</template>
```

## Meaningful Information

- `index.ts` exports exactly `Sheet`, `SheetClose`, `SheetContent`, `SheetDescription`, `SheetFooter`, `SheetHeader`, `SheetTitle`, and `SheetTrigger`. Each export is the default export of its Vue file.
- `SheetOverlay.vue` exists in this folder, but `index.ts` does not export it. `SheetContent` uses it internally, so there is no public `<UISheetOverlay>` tag.
- `shadcn-nuxt` reads `@/components/ui` from `apps/web/nuxt.config.ts` and prefixes auto-imported component tags with `UI`. Use `<UISheet>`, `<UISheetTrigger>`, `<UISheetContent>`, `<UISheetHeader>`, `<UISheetFooter>`, `<UISheetTitle>`, `<UISheetDescription>`, and `<UISheetClose>` without component imports. No lowercase helper or type-only export comes from this component. Import Vue helpers such as `ref` explicitly when an example needs them.
- Put `SheetTrigger` and `SheetContent` inside `Sheet`. Put `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`, and `SheetClose` inside `SheetContent`. Render one `SheetTitle` in every sheet, even when the title is visually hidden.
- `Sheet` forwards Reka UI `DialogRootProps` and `DialogRootEmits`. `defaultOpen` starts an uncontrolled sheet as open and defaults to `false`. `open` controls the state. `modal` defaults to `true`. `unmountOnHide` defaults to `true` and removes hidden content instead of keeping it mounted. Use `v-model:open` for controlled state, or use `defaultOpen` for initial state without a controller. The root emits `update:open` with the new boolean value. Its default slot exposes `open` and `close`.
- `SheetTrigger` forwards `DialogTriggerProps`. It renders a `button` by default. Use `as` to select another element or component. The `asChild` prop appears as `as-child` in templates. Use it to merge trigger behavior into one child, such as `<UIButton>`, instead of nesting a button.
- `SheetContent` forwards `DialogContentProps` and `DialogContentEmits`. It also accepts `class`, `side`, and `showCloseButton`. The `side` values are `"top"`, `"right"`, `"bottom"`, and `"left"`. The default is `"right"`. `showCloseButton` defaults to `true`.
- `SheetContent` wraps its content in `DialogPortal`, renders `SheetOverlay`, and then renders the Reka UI dialog content. The portal sends the overlay and panel to `body`. The overlay covers the viewport with the component's translucent backdrop and fade animation. Do not add a portal or overlay yourself.
- The built-in close control is a ghost icon button in the top-right corner. It has an `sr-only` `Close` label. Set `:show-close-button="false"` when the sheet supplies its own `SheetClose` control.
- `SheetContent` has these preventable events. Use kebab-case names in templates. `closeAutoFocus` is `@close-auto-focus`, `escapeKeyDown` is `@escape-key-down`, `focusOutside` is `@focus-outside`, `interactOutside` is `@interact-outside`, `openAutoFocus` is `@open-auto-focus`, and `pointerDownOutside` is `@pointer-down-outside`. Call `event.preventDefault()` to cancel the event's default behavior.
- `SheetContent` sizing follows `side`. `top` and `bottom` use the full horizontal inset and `h-auto`. `top` has a bottom border and `bottom` has a top border. `left` and `right` use the full vertical inset, `h-full`, `w-3/4`, and `sm:max-w-sm`. `left` has a right border and `right` has a left border. Pass responsive width classes through `class` when the default width is not appropriate.
- `SheetHeader` accepts `class` and renders a padded vertical `div` with a small gap. `SheetFooter` accepts `class` and renders a padded vertical `div` with a small gap and `mt-auto`, which keeps footer actions at the bottom of the panel.
- `SheetTitle` forwards Reka UI `DialogTitleProps` and `class`. It renders an `h2` by default and supplies the accessible name. `SheetDescription` forwards `DialogDescriptionProps` and `class`. It renders a `p` by default and supplies the optional accessible description.
- Use `class="sr-only"` on `SheetTitle` when the visual design has another heading but the dialog still needs an accessible name. If the sheet has no description, pass `:aria-describedby="undefined"` to `SheetContent`. A close icon needs an accessible label. The built-in close button already has one.
- `SheetClose` forwards Reka UI `DialogCloseProps` and renders a `button` by default. Use `as-child` around a `UIButton` or another single control. Activating it closes the nearest sheet.
- With the default `modal` value of `true`, focus stays inside the open sheet and the rest of the page is inert to interaction and screen readers. `Tab` and `Shift+Tab` cycle through focusable controls. `Esc` closes the sheet and returns focus to the trigger. Set `:modal="false"` only when the panel must allow interaction with the page behind it. `disable-outside-pointer-events` and the outside interaction events provide finer control when needed.
- `Sheet` does not change its interaction model at a breakpoint. Use `class="w-full sm:max-w-md"` or another responsive class on `SheetContent` to change its size. Use `Drawer` instead when the mobile version needs swipe-to-dismiss behavior.
- The panel unmounts when closed by default. Use `:unmount-on-hide="false"` when hidden content must stay mounted. Use `:force-mount="true"` on `SheetContent` only when an animation or another integration needs the content mounted outside its normal presence lifecycle.
- Keep `SheetTitle` and `SheetDescription` inside `SheetContent`, not beside it. `SheetContent` owns the Reka UI dialog context, portal, overlay, and focus behavior. A duplicate overlay or portal can produce incorrect stacking and dismissal behavior.

## Examples

Use `side` on `SheetContent`, not on `Sheet`.

```vue
<template>
  <UISheet>
    <UISheetTrigger as-child>
      <UIButton variant="outline">Open from the top</UIButton>
    </UISheetTrigger>
    <UISheetContent side="top">
      <UISheetHeader>
        <UISheetTitle>Top sheet</UISheetTitle>
        <UISheetDescription>Content enters from the top edge.</UISheetDescription>
      </UISheetHeader>
    </UISheetContent>
  </UISheet>
</template>
```

```vue
<template>
  <UISheet>
    <UISheetTrigger as-child>
      <UIButton variant="outline">Open from the right</UIButton>
    </UISheetTrigger>
    <UISheetContent side="right">
      <UISheetHeader>
        <UISheetTitle>Right sheet</UISheetTitle>
        <UISheetDescription>Content enters from the right edge.</UISheetDescription>
      </UISheetHeader>
    </UISheetContent>
  </UISheet>
</template>
```

```vue
<template>
  <UISheet>
    <UISheetTrigger as-child>
      <UIButton variant="outline">Open from the bottom</UIButton>
    </UISheetTrigger>
    <UISheetContent side="bottom">
      <UISheetHeader>
        <UISheetTitle>Bottom sheet</UISheetTitle>
        <UISheetDescription>Content enters from the bottom edge.</UISheetDescription>
      </UISheetHeader>
    </UISheetContent>
  </UISheet>
</template>
```

```vue
<template>
  <UISheet>
    <UISheetTrigger as-child>
      <UIButton variant="outline">Open from the left</UIButton>
    </UISheetTrigger>
    <UISheetContent side="left">
      <UISheetHeader>
        <UISheetTitle>Left sheet</UISheetTitle>
        <UISheetDescription>Content enters from the left edge.</UISheetDescription>
      </UISheetHeader>
    </UISheetContent>
  </UISheet>
</template>
```

Use the controlled model when a form needs to close the sheet after submission. This follows the form example on the Sheet documentation page and keeps the panel full width on small screens.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <UISheet v-model:open="open">
    <UISheetTrigger as-child>
      <UIButton variant="outline">Edit profile</UIButton>
    </UISheetTrigger>
    <UISheetContent class="w-full sm:max-w-md" :show-close-button="false">
      <form class="flex flex-1 flex-col" @submit.prevent="open = false">
        <UISheetHeader>
          <UISheetTitle>Edit profile</UISheetTitle>
          <UISheetDescription>
            Make changes to your profile here. Click save when you are done.
          </UISheetDescription>
        </UISheetHeader>
        <div class="grid flex-1 auto-rows-min gap-6 px-4">
          <div class="grid gap-3">
            <UILabel for="sheet-name">Name</UILabel>
            <UIInput id="sheet-name" default-value="Pedro Duarte" />
          </div>
          <div class="grid gap-3">
            <UILabel for="sheet-username">Username</UILabel>
            <UIInput id="sheet-username" default-value="@peduarte" />
          </div>
        </div>
        <UISheetFooter>
          <UIButton type="submit">Save changes</UIButton>
          <UISheetClose as-child>
            <UIButton type="button" variant="outline">Cancel</UIButton>
          </UISheetClose>
        </UISheetFooter>
      </form>
    </UISheetContent>
  </UISheet>
</template>
```

## References

- [shadcn-vue Sheet documentation](https://shadcn-vue.com/docs/components/sheet) for the installation, usage, and form example.
- [Reka UI Dialog documentation](https://reka-ui.com/docs/components/dialog) for the forwarded props, events, slot props, portal behavior, focus behavior, and accessibility pattern.
- [Dialog](../dialog/AGENTS.md) for the shared Reka UI dialog behavior and event names.
- [Drawer](../drawer/AGENTS.md) for a responsive alternative with swipe-to-dismiss behavior.
- [Button](../button/AGENTS.md) for the variants and sizes used by triggers and close controls.
- [Input](../input/AGENTS.md) for form fields inside a sheet.
- [Label](../label/AGENTS.md) for labels associated with sheet form fields.
