# Alert

Displays a callout for user attention.

## Conclusion

Alert is a plain `div` with `role="alert"` that composes from four parts: `Alert` (container), `AlertTitle`, `AlertDescription`, and `AlertAction`. Only `Alert` is required; title, description, and action are optional and nest as direct children. The one gotcha is status/icon layout, which is driven by slot position, so place a leading `<svg>` icon as the first child of `Alert` and let CSS move the title into the second column.

## Usage

```vue
<template>
  <UIAlert>
    <UIAlertTitle>Heads up!</UIAlertTitle>
    <UIAlertDescription>
      You can add components and dependencies to your app using the cli.
    </UIAlertDescription>
  </UIAlert>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UIAlert>`, `<UIAlertTitle>`, `<UIAlertDescription>`, and `<UIAlertAction>` in templates with no import. The `alertVariants` helper and `AlertVariants` type need an explicit import from `@/components/ui/alert`.
- Exports from `@/components/ui/alert`: `Alert`, `AlertAction`, `AlertDescription`, `AlertTitle`, `alertVariants`, type `AlertVariants`.
- `Alert.vue` props: `variant?: AlertVariants['variant']`, `class?: HTMLAttributes['class']`. Renders `<div data-slot="alert" role="alert">`.
- `variant` enumeration: `default`, `destructive`. Default value is `default`. `default` uses `bg-card text-card-foreground`; `destructive` uses `text-destructive` on a card background.
- `AlertTitle.vue`, `AlertDescription.vue`, and `AlertAction.vue` accept only `class?: HTMLAttributes['class']`. Each renders a `div` with `data-slot` of `alert-title`, `alert-description`, or `alert-action`.
- There are no sizes, no `v-model`, and no events on any part. All parts are presentational and forward only a `class` prop plus default slot.
- `Alert` is a required wrapper; the other three parts render correctly only inside it. Nest `AlertTitle` before `AlertDescription`.
- `AlertAction` positions itself `absolute top-2 right-2` inside the alert. Adding it triggers the container to reserve right padding, so no manual offset is needed.
- Include a leading icon as the first child of `Alert` to switch the grid to `auto 1fr`; the icon spans rows and `AlertTitle` shifts to the second column. Icons default to `size-4` unless a `size-*` class is set.
- `Alert` already carries `role="alert"` for assistive tech. Keep the visible title and description text meaningful; do not add a redundant `role` on children.
- `AlertDescription` supports rich content. Direct child `p` elements other than the last get `mb-4`, and nested anchors get underline styling automatically.

## Examples

```vue
<!-- Title, icon, and description -->
<script setup lang="ts">
import { CheckCircle2Icon } from '@lucide/vue'
</script>

<template>
  <UIAlert>
    <CheckCircle2Icon />
    <UIAlertTitle>Success! Your changes have been saved</UIAlertTitle>
    <UIAlertDescription>
      This is an alert with icon, title and description.
    </UIAlertDescription>
  </UIAlert>
</template>
```

```vue
<!-- Title and icon only, no description -->
<script setup lang="ts">
import { PopcornIcon } from '@lucide/vue'
</script>

<template>
  <UIAlert>
    <PopcornIcon />
    <UIAlertTitle>This Alert has a title and an icon. No description.</UIAlertTitle>
  </UIAlert>
</template>
```

```vue
<!-- Destructive variant with rich list content -->
<script setup lang="ts">
import { AlertCircleIcon } from '@lucide/vue'
</script>

<template>
  <UIAlert variant="destructive">
    <AlertCircleIcon />
    <UIAlertTitle>Unable to process your payment.</UIAlertTitle>
    <UIAlertDescription>
      <p>Please verify your billing information and try again.</p>
      <ul class="mt-2 list-inside list-disc space-y-1">
        <li>Check your card details</li>
        <li>Ensure sufficient funds</li>
        <li>Verify billing address</li>
      </ul>
    </UIAlertDescription>
  </UIAlert>
</template>
```

```vue
<!-- Dismiss action pinned to the top right -->
<script setup lang="ts">
import { XIcon } from '@lucide/vue'
</script>

<template>
  <UIAlert>
    <UIAlertTitle>Heads up!</UIAlertTitle>
    <UIAlertDescription>You can add components using the cli.</UIAlertDescription>
    <UIAlertAction>
      <UIButton variant="ghost" size="icon" aria-label="Dismiss">
        <XIcon />
      </UIButton>
    </UIAlertAction>
  </UIAlert>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/alert)
- [Button](../button/AGENTS.md) for dismiss or call-to-action controls inside `AlertAction`.
