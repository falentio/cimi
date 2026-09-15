# Drawer

A panel that slides in from a screen edge with swipe-to-dismiss, for a mobile bottom sheet or an edge panel on any viewport.

## Conclusion

Reach for `Drawer` when a panel should be dismissible by dragging, with `DrawerContent` rendering its own overlay, portal, and grab handle. `Drawer` and `DrawerContent` are the only mandatory parts; `DrawerTrigger`, `DrawerHeader`, `DrawerFooter`, `DrawerTitle`, `DrawerDescription`, and `DrawerClose` are optional, though you must always render a `DrawerTitle` for accessibility. The one gotcha: this wraps reka-ui `DrawerRoot`, so direction is set with `swipe-direction` (default `down`, emerging from the bottom edge) and the swipe drives the same CSS custom-property transform system as the primitive.

## Usage

```vue
<template>
  <UIDrawer>
    <UIDrawerTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UIDrawerTrigger>
    <UIDrawerContent>
      <UIDrawerHeader>
        <UIDrawerTitle>Are you absolutely sure?</UIDrawerTitle>
        <UIDrawerDescription>This action cannot be undone.</UIDrawerDescription>
      </UIDrawerHeader>
      <UIDrawerFooter>
        <UIButton>Submit</UIButton>
        <UIDrawerClose as-child>
          <UIButton variant="outline">Cancel</UIButton>
        </UIDrawerClose>
      </UIDrawerFooter>
    </UIDrawerContent>
  </UIDrawer>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIDrawer>`, `<UIDrawerTrigger>`, `<UIDrawerContent>`, `<UIDrawerHeader>`, `<UIDrawerFooter>`, `<UIDrawerTitle>`, `<UIDrawerDescription>`, `<UIDrawerClose>`, and `<UIDrawerOverlay>` in templates with no import.
- The folder is `@/components/ui/drawer`. `index.ts` exports exactly `Drawer`, `DrawerClose`, `DrawerContent`, `DrawerDescription`, `DrawerFooter`, `DrawerHeader`, `DrawerOverlay`, `DrawerTitle`, `DrawerTrigger`.
- Every export is a Vue component with a default export, so all are auto-imported by their `UI`-prefixed name. No lowercase helper, type-only, or non-component export exists here, so no explicit import from `@/components/ui/drawer` is ever needed.
- Required nesting: `Drawer` wraps everything; `DrawerTrigger` and `DrawerContent` are its direct children; `DrawerHeader` and `DrawerFooter` sit inside `DrawerContent`; `DrawerTitle` and `DrawerDescription` sit inside `DrawerHeader`.
- `Drawer` forwards all `DrawerRootProps` and `DrawerRootEmits` from reka-ui. Props include `open`, `defaultOpen`, `modal` (default `true`), `swipeDirection` (`'up' | 'down' | 'left' | 'right'`, default `'down'`), `snapPoints`, `activeSnapPoint`, `defaultActiveSnapPoint`, `fixed`, `handleOnly`, `dismissible`, `closeThreshold`, `scrollLockTimeout`, `nested`, and `noBodyStyles`.
- Bind `v-model:open` on `Drawer` to control visibility; bind `v-model:snap-point` to control the active snap point; leave either off for uncontrolled use.
- `Drawer` events: `update:open`, `drag`, `release`, `close`. The `update:open` payload carries a `details` object whose `reason` is one of `swipe`, `escape-key`, `outside-press`, `click`, `cancel`, `trigger-press`, `close-press`.
- `Drawer` default slot props expose `open` and `close`, so you can close programmatically inside any nested content.
- `DrawerContent` forwards `DrawerContentProps` and `DrawerContentEmits`, plus local `class`. It renders `DrawerPortal`, `DrawerOverlay`, and a `DrawerHandle` internally, so never add `DrawerOverlay` or a portal wrapper yourself.
- `DrawerContent` is laid out with `data-[swipe-direction=...]` selectors, so its position, corner radius, border side, and max size follow the `swipe-direction` set on `Drawer`.
- `DrawerHeader` and `DrawerFooter` accept only `class` and render plain `div` wrappers. Header centers when direction is `up` or `down`; footer uses `mt-auto` to pin to the bottom.
- `DrawerTitle` forwards `DrawerTitleProps` plus `class` and supplies the accessible name. `DrawerDescription` forwards `DrawerDescriptionProps` plus `class` and supplies the accessible description.
- Always render `DrawerTitle`. To hide it visually, wrap it in the reka-ui Visually Hidden utility with `as-child`.
- To omit the description entirely, drop `DrawerDescription` and pass `:aria-describedby="undefined"` to `DrawerContent`.
- `DrawerTrigger` and `DrawerClose` forward their reka-ui props; each renders a `button` by default. Set `as-child` to wrap a `UIButton` or any element. `DrawerClose` closes the drawer on activation.
- `snapPoints` accepts fractions of the viewport (`0` to `1`), pixel values greater than `1`, or strings such as `'148px'` and `'30rem'`. Set `activeSnapPoint` or `v-model:snap-point` to read or drive the resting position.
- `handleOnly` restricts the drag gesture to the grab handle instead of the whole content; `dismissible` (default `true`) toggles swipe-to-close.
- `modal` accepts `true` (trap focus, lock scroll, dismiss on outside press), `'trap-focus'` (keep the focus trap with no overlay), or `false` (non-modal). Overlay renders only while `modal` is `true`.
- Focus is trapped inside while modal, `Esc` closes and returns focus to `DrawerTrigger`, and `Space` and `Enter` toggle the drawer. This follows the Dialog WAI-ARIA design pattern.
- The live drag offset is exposed through `--drawer-swipe-movement-x`, `--drawer-swipe-movement-y`, `--drawer-snap-point-offset`, and `--drawer-swipe-progress` on `DrawerContent`; style custom transforms against these.
- The shadcn-vue docs page does not mark `Drawer` as deprecated and does not direct you to `Sheet`; it recommends pairing `Drawer` with `Dialog` for a responsive modal.

## Examples

```vue
<!-- Intent: basic bottom drawer with a trigger and cancel -->
<template>
  <UIDrawer>
    <UIDrawerTrigger as-child>
      <UIButton variant="outline">Open Drawer</UIButton>
    </UIDrawerTrigger>
    <UIDrawerContent>
      <UIDrawerHeader>
        <UIDrawerTitle>Move Goal</UIDrawerTitle>
        <UIDrawerDescription>Set your daily activity goal.</UIDrawerDescription>
      </UIDrawerHeader>
      <UIDrawerFooter>
        <UIButton>Submit</UIButton>
        <UIDrawerClose as-child>
          <UIButton variant="outline">Cancel</UIButton>
        </UIDrawerClose>
      </UIDrawerFooter>
    </UIDrawerContent>
  </UIDrawer>
</template>
```

```vue
<!-- Intent: choose the edge the drawer slides from with swipe-direction -->
<template>
  <UIDrawer swipe-direction="right">
    <UIDrawerTrigger as-child>
      <UIButton variant="outline">Open from right</UIButton>
    </UIDrawerTrigger>
    <UIDrawerContent>
      <UIDrawerHeader>
        <UIDrawerTitle>Move Goal</UIDrawerTitle>
        <UIDrawerDescription>Set your daily activity goal.</UIDrawerDescription>
      </UIDrawerHeader>
      <UIDrawerFooter>
        <UIDrawerClose as-child>
          <UIButton variant="outline">Cancel</UIButton>
        </UIDrawerClose>
      </UIDrawerFooter>
    </UIDrawerContent>
  </UIDrawer>
</template>
```

```vue
<!-- Intent: multi-step drawer resting at snap points -->
<script setup lang="ts">
import { ref } from 'vue'

const snapPoints = [0.4, 0.75, 1]
const activeSnapPoint = ref<number | string | null>(0.4)
</script>

<template>
  <UIDrawer v-model:snap-point="activeSnapPoint" :snap-points="snapPoints">
    <UIDrawerTrigger as-child>
      <UIButton variant="outline">Open</UIButton>
    </UIDrawerTrigger>
    <UIDrawerContent>
      <UIDrawerHeader>
        <UIDrawerTitle>Move Goal</UIDrawerTitle>
        <UIDrawerDescription>Set your daily activity goal.</UIDrawerDescription>
      </UIDrawerHeader>
      <UIDrawerFooter>
        <UIButton @click="activeSnapPoint = snapPoints[0]">Collapse</UIButton>
        <UIButton @click="activeSnapPoint = snapPoints[2]">Expand</UIButton>
      </UIDrawerFooter>
    </UIDrawerContent>
  </UIDrawer>
</template>
```

```vue
<!-- Intent: responsive modal that is a drawer on small viewports and a dialog otherwise -->
<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { computed, ref } from 'vue'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'

const isDesktop = useMediaQuery('(min-width: 640px)')
const Modal = computed(() => ({
  Root: isDesktop.value ? Dialog : Drawer,
  Trigger: isDesktop.value ? DialogTrigger : DrawerTrigger,
  Content: isDesktop.value ? DialogContent : DrawerContent,
  Header: isDesktop.value ? DialogHeader : DrawerHeader,
  Title: isDesktop.value ? DialogTitle : DrawerTitle,
  Description: isDesktop.value ? DialogDescription : DrawerDescription,
  Footer: isDesktop.value ? DialogFooter : DrawerFooter,
  Close: isDesktop.value ? DialogClose : DrawerClose,
}))
const open = ref(false)
</script>

<template>
  <component :is="Modal.Root" v-model:open="open">
    <component :is="Modal.Trigger" as-child>
      <UIButton variant="outline">Open Dialog</UIButton>
    </component>
    <component :is="Modal.Content" class="sm:max-w-md">
      <component :is="Modal.Header">
        <component :is="Modal.Title">Share Link</component>
        <component :is="Modal.Description">Anyone with this link can view it.</component>
      </component>
      <component :is="Modal.Footer">
        <component :is="Modal.Close" as-child>
          <UIButton variant="outline">Close</UIButton>
        </component>
      </component>
    </component>
  </component>
</template>
```

```vue
<!-- Intent: react to the reason the drawer closed -->
<script setup lang="ts">
function onOpenChange(open: boolean, details?: { reason?: string }) {
  if (!open && details?.reason === 'swipe') {
    // user flicked the drawer away
  }
}
</script>

<template>
  <UIDrawer @update:open="onOpenChange">
    <UIDrawerTrigger>Open</UIDrawerTrigger>
    <UIDrawerContent>
      <UIDrawerTitle>Notifications</UIDrawerTitle>
    </UIDrawerContent>
  </UIDrawer>
</template>
```

## References

- [shadcn-vue Drawer](https://shadcn-vue.com/docs/components/drawer)
- [reka-ui Drawer](https://reka-ui.com/docs/components/drawer) for every forwarded prop, emit, slot prop, and data attribute
- [Dialog](../dialog/AGENTS.md) for the desktop half of a responsive modal
