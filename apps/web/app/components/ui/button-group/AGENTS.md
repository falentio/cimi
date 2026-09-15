# Button Group

A container that groups related buttons together with consistent styling, and joins their corners into one segmented control.

## Conclusion

Reach for `UIButtonGroup` when several buttons perform related actions and should read as a single unit. The group is a plain `<div role="group">`; `Button`, `Input`, `Select`, `DropdownMenu`, and other components go inside as children, so membership is composition rather than a prop. `UIButtonGroupSeparator` and `UIButtonGroupText` are optional, and only the separator is needed in most cases. The one gotcha: the group strips inner rounded corners and borders from its direct children with descendant selectors, so never hand-set rounding or left borders on grouped buttons, and never nest unrelated padding wrappers between the group and its buttons.

## Usage

```vue
<template>
  <UIButtonGroup>
    <UIButton>Button 1</UIButton>
    <UIButton>Button 2</UIButton>
  </UIButtonGroup>
</template>
```

## Meaningful Information

- Export names from `button-group/index.ts`: `ButtonGroup`, `ButtonGroupSeparator`, `ButtonGroupText`, `buttonGroupVariants`, and type `ButtonGroupVariants`.
- Auto-import via the `shadcn-nuxt` module uses the `UI` prefix, so `<UIButtonGroup>`, `<UIButtonGroupSeparator>`, and `<UIButtonGroupText>` need no import. `buttonGroupVariants` and `ButtonGroupVariants` need `import { buttonGroupVariants } from '@/components/ui/button-group'` and `import type { ButtonGroupVariants } from '@/components/ui/button-group'`.
- `ButtonGroup` props: `orientation` and `class`. No other props exist.
- `ButtonGroup` `orientation` values: `horizontal`, `vertical`. Defaults to `horizontal`. It sets `data-orientation` and the flex direction.
- `ButtonGroup` renders `role="group"` on a `<div>` and passes `class` through `cn`, so you can add layout utilities such as `class="h-fit"` or `class="flex-1"`.
- Membership is positional. Put `Button`, `Input`, `InputGroup`, `Select`, `DropdownMenu`, `Popover`, and similar components directly in the default slot.
- Children ordering matters: the group's selectors key off `:first-child`, `:last-child`, and `[data-slot]` siblings to round only the outer corners, so do not wrap buttons in extra elements that break sibling adjacency.
- Inner sizes come from each child, not the group. Buttons inside keep their own `variant` and `size`.
- `ButtonGroupSeparator` props: `orientation` (from Reka `SeparatorProps`), `class`. `orientation` values: `horizontal`, `vertical`. Defaults to `vertical`.
- `ButtonGroupSeparator` wraps `Separator` and sets `data-slot="button-group-separator"` and `self-stretch`, so it fills the group's cross axis automatically.
- Use a separator only for non-`outline` buttons. `outline` buttons already carry a border, so a separator there produces a double line.
- `ButtonGroupText` props: `as`, `asChild`, `orientation`, `class`. `as` defaults to `div`; `asChild` defaults to `false`.
- `ButtonGroupText` renders a muted bordered box for labels and affixes. Pass `as-child` to render a custom element such as `Label` as the text box.
- Nest a `UIButtonGroup` inside another `UIButtonGroup` to get spacing between sub-groups. The outer group adds `gap-2` when it detects nested group children.
- Nesting a `Select` gets `w-fit` on its trigger unless you pass an explicit `w-*` class.
- Accessibility: the group has `role="group"`. Add `aria-label` or `aria-labelledby` to name it. `Tab` moves between the buttons inside.
- Use `ButtonGroup` for buttons that perform actions. Use `ToggleGroup` for buttons that toggle a state.
- Merging overrides: pass `class` for anything the variants do not cover, including `bg-*`, `--radius`, and layout utilities.
- Never fabricate props. Only the props listed per component are supported.

## Examples

```vue
<!-- Intent: minimal group of related action buttons -->
<template>
  <UIButtonGroup>
    <UIButton>Button 1</UIButton>
    <UIButton>Button 2</UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: labelled group, satisfying the accessibility requirement -->
<template>
  <UIButtonGroup aria-label="Button group">
    <UIButton>Button 1</UIButton>
    <UIButton>Button 2</UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: vertical orientation for stacked controls -->
<script setup lang="ts">
import { MinusIcon, PlusIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup orientation="vertical" aria-label="Media controls" class="h-fit">
    <UIButton variant="outline" size="icon">
      <PlusIcon />
    </UIButton>
    <UIButton variant="outline" size="icon">
      <MinusIcon />
    </UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: control scale per button with size -->
<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup>
    <UIButton variant="outline" size="sm">Small</UIButton>
    <UIButton variant="outline" size="sm">Button</UIButton>
    <UIButton variant="outline" size="sm">Group</UIButton>
    <UIButton variant="outline" size="icon-sm">
      <PlusIcon />
    </UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: nested groups to add spacing between sub-groups -->
<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup>
    <UIButtonGroup>
      <UIButton variant="outline" size="sm">1</UIButton>
      <UIButton variant="outline" size="sm">2</UIButton>
      <UIButton variant="outline" size="sm">3</UIButton>
    </UIButtonGroup>
    <UIButtonGroup>
      <UIButton variant="outline" size="icon-sm" aria-label="Previous">
        <ArrowLeftIcon />
      </UIButton>
      <UIButton variant="outline" size="icon-sm" aria-label="Next">
        <ArrowRightIcon />
      </UIButton>
    </UIButtonGroup>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: separate non-outline buttons so the divider reads clearly -->
<template>
  <UIButtonGroup>
    <UIButton variant="secondary" size="sm">Copy</UIButton>
    <UIButtonGroupSeparator />
    <UIButton variant="secondary" size="sm">Paste</UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: split button with a primary action and an icon action -->
<script setup lang="ts">
import { PlusIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup>
    <UIButton variant="secondary">Button</UIButton>
    <UIButtonGroupSeparator />
    <UIButton size="icon" variant="secondary">
      <PlusIcon />
    </UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: join an input with a trailing action button -->
<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup>
    <UIInput placeholder="Search..." />
    <UIButton variant="outline" aria-label="Search">
      <SearchIcon />
    </UIButton>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: split group whose second action opens a dropdown menu -->
<script setup lang="ts">
import { ChevronDownIcon } from '@lucide/vue'
</script>

<template>
  <UIButtonGroup>
    <UIButton variant="outline">Follow</UIButton>
    <UIDropdownMenu>
      <UIDropdownMenuTrigger as-child>
        <UIButton variant="outline" size="icon" aria-label="More options">
          <ChevronDownIcon />
        </UIButton>
      </UIDropdownMenuTrigger>
      <UIDropdownMenuContent align="end">
        <UIDropdownMenuGroup>
          <UIDropdownMenuItem>Mute Conversation</UIDropdownMenuItem>
          <UIDropdownMenuItem>Mark as Read</UIDropdownMenuItem>
        </UIDropdownMenuGroup>
      </UIDropdownMenuContent>
    </UIDropdownMenu>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: pair a select with an input inside nested groups -->
<script setup lang="ts">
import { ArrowRightIcon } from '@lucide/vue'
import { ref } from 'vue'

const currency = ref('$')
</script>

<template>
  <UIButtonGroup>
    <UIButtonGroup>
      <UISelect v-model="currency">
        <UISelectTrigger class="font-mono w-14">
          {{ currency }}
        </UISelectTrigger>
        <UISelectContent class="min-w-24">
          <UISelectItem value="$">US Dollar</UISelectItem>
          <UISelectItem value="€">Euro</UISelectItem>
        </UISelectContent>
      </UISelect>
      <UIInput placeholder="10.00" pattern="[0-9]*" />
    </UIButtonGroup>
    <UIButtonGroup>
      <UIButton aria-label="Send" size="icon" variant="outline">
        <ArrowRightIcon />
      </UIButton>
    </UIButtonGroup>
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: text affix rendered as a label with as-child -->
<template>
  <UIButtonGroup>
    <UIButtonGroupText as-child>
      <UILabel for="name">Text</UILabel>
    </UIButtonGroupText>
    <UIInput id="name" placeholder="Type something here..." />
  </UIButtonGroup>
</template>
```

```vue
<!-- Intent: reading buttonGroupVariants for a custom element -->
<script setup lang="ts">
import { buttonGroupVariants } from '@/components/ui/button-group'
</script>

<template>
  <div :class="buttonGroupVariants({ orientation: 'vertical' })">
    <slot />
  </div>
</template>
```

## References

- [Button Group](https://shadcn-vue.com/docs/components/button-group)
- [Button](../button/AGENTS.md)
- [Input](../input/AGENTS.md)
- [Input Group](../input-group/AGENTS.md)
- [Select](../select/AGENTS.md)
- [Dropdown Menu](../dropdown-menu/AGENTS.md)
- [Separator](../separator/AGENTS.md)
- [Toggle Group](../toggle-group/AGENTS.md) for stateful toggles
- [Reka UI Separator](https://reka-ui.com/docs/components/separator)
- [Reka UI Primitive](https://reka-ui.com/docs/utilities/primitive)
