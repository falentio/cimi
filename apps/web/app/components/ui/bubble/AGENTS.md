# Bubble

Provides a presentational chat surface for conversational content, alignment, visual variants, grouped messages, and anchored reactions.

## Conclusion

Use `<UIBubble>` as the root for one message surface. Put `<UIBubbleContent>` directly inside it. Add `<UIBubbleReactions>` as another direct child when the bubble has static reactions or action buttons. Wrap consecutive bubbles from one sender in `<UIBubbleGroup>`.

Use `<UIMessage>` for the full conversation row when you need an avatar, sender metadata, timestamps, or message-level actions. Keep the bubble surface inside `<UIMessageContent>`, and put any avatar inside `<UIAvatar>`.

These components only render slots and styles. They do not fetch messages, own reaction state, expose `v-model`, or emit custom component events.

## Usage

`shadcn-nuxt` auto-imports the four component exports with the `UI` prefix configured in `apps/web/nuxt.config.ts`. Use these tags in templates without importing the components.

- `Bubble` becomes `<UIBubble>`.
- `BubbleGroup` becomes `<UIBubbleGroup>`.
- `BubbleContent` becomes `<UIBubbleContent>`.
- `BubbleReactions` becomes `<UIBubbleReactions>`.

Neighboring UI components use the same prefix. Use `<UIButton>`, `<UIMessage>`, and `<UIAvatar>` in templates rather than importing those components.

The lowercase helpers require explicit imports from `@/components/ui/bubble`. Import `BubbleVariants` and `BubbleReactionsVariants` as types.

```ts
import { bubbleReactionsVariants, bubbleVariants } from '@/components/ui/bubble'
import type { BubbleReactionsVariants, BubbleVariants } from '@/components/ui/bubble'
```

The normal composition is a bubble with direct content and optional direct reactions. `UIBubbleGroup` contains the bubble roots, not their content parts.

## Meaningful Information

- **Exports.** `index.ts` exports `Bubble`, `BubbleContent`, `BubbleGroup`, `BubbleReactions`, `bubbleVariants`, `BubbleVariants`, `bubbleReactionsVariants`, and `BubbleReactionsVariants`. The four component exports are Vue components. The two lowercase exports are class-variance-authority helpers. The two PascalCase type exports are type-only aliases derived from those helpers.
- **Shared props.** All four components accept `as`, `as-child`, and `class`. `as` defaults to `div` and accepts an element name or component. `as-child` defaults to `false` and merges the component's attributes and classes onto its single default-slot child. `class` adds classes to the rendered part.
- **`Bubble` props.** `variant` defaults to `default` and has the exact union `"default" | "secondary" | "muted" | "tinted" | "outline" | "ghost" | "destructive"`. `align` defaults to `start` and has the exact union `"start" | "end"`.
- **`BubbleContent` props.** It has no component-specific props. It defaults to a `div` and provides the padded message surface.
- **`BubbleGroup` props.** It has no component-specific props. It defaults to a `div` and stacks its bubbles with a vertical gap. It does not accept `align` or `variant`.
- **`BubbleReactions` props.** `side` defaults to `bottom` and has the exact union `"top" | "bottom"`. `align` defaults to `end` and has the exact union `"start" | "end"`. Its `BubbleReactionsVariants` type exposes those same unions.
- **Alignment.** `align="start"` places the bubble at the start of its flex container. `align="end"` places it at the end and moves the content to the end within the bubble. Set `align` on each `<UIBubble>`, not on `<UIBubbleGroup>`. When a bubble is a direct child of `<UIMessageContent>`, it follows an end-aligned `<UIMessage>` through the local group selector, so prefer setting the message alignment on `<UIMessage>`.
- **Sizing.** A normal bubble sizes to its content and stops at 80% of the available width. `<UIBubbleContent>` adds rounded corners, transparent border space, horizontal and vertical padding, small text, relaxed line height, wrapping for long words, and a full-width limit inside the bubble.
- **Variants.** The default variant gives direct `<UIBubbleContent>` children the primary background and primary foreground. `secondary` uses the secondary colors. `muted` lowers emphasis. `tinted` uses a soft primary tint. `outline` uses the background with a border. `destructive` uses destructive colors for errors or failed actions. `ghost` removes the content background, border, padding, and rounding, removes the bubble width limit, and lets assistant text or rich content span the row.
- **Composition.** Keep `<UIBubbleContent>` and `<UIBubbleReactions>` as direct children of `<UIBubble>`. The variant styles target direct children marked with `data-slot="bubble-content"`. `<UIBubbleGroup>` should contain `<UIBubble>` elements and preserves a consistent `gap-2` column layout.
- **Rendered markers.** The roots render `data-slot="bubble"`, `data-slot="bubble-group"`, `data-slot="bubble-content"`, and `data-slot="bubble-reactions"`. `UIBubble` also renders `data-variant` and `data-align`. `UIBubbleReactions` renders `data-side` and `data-align`.
- **Polymorphic roots.** All parts render a `div` by default. Use `as` to choose another element or component. Use `as-child` when one default-slot child must receive the part's attributes and classes. A wrapper with multiple children cannot be used as the `as-child` target.
- **Reactions slots.** `UIBubbleReactions` exposes one unnamed default slot. Use spans or other non-interactive content for a static reaction row. Use `<UIButton>` or another real interactive control for reaction actions. The component does not provide named slots, slot props, selection state, or click handling.
- **Reaction placement.** Reactions are absolutely positioned over the bubble edge. `side="top"` anchors them to the top edge, and `side="bottom"` anchors them to the bottom edge. `align="start"` uses the start offset, and `align="end"` uses the end offset. Leave extra vertical space between rows when reactions overlap adjacent bubbles.
- **State and events.** None of the four components declares `v-model` or custom emitted events. Keep message text, selected reactions, loading state, and action handlers in the parent. Native listeners can target a rendered root, and interactive controls can use their normal native events.
- **Message accessibility.** Bubble parts are presentational and set no conversation role by default. Give the surrounding message structure the semantic role it owns. Keep message text as readable text instead of relying on a color variant. For a clickable bubble, render a real `button` or `a` through `<UIBubbleContent as-child>`. The content styles include a visible focus ring for those interactive elements.
- **Reaction accessibility.** Give a static emoji row `role="img"` and a descriptive `aria-label` so assistive technology announces the row once. Use real buttons for interactive reactions. Give icon-only reaction buttons an `aria-label`, set `type="button"` when they sit inside a form, and expose selected state with `aria-pressed` when applicable. Do not use `role="img"` on an interactive reaction row because it would hide the button semantics.
- **Gotchas.** Do not put `align` on `<UIBubbleGroup>`. Do not wrap `<UIBubbleContent>` in another element when the bubble variant must style it. Use `variant="ghost"` when content must be unframed and full width. Reactions overlap the bubble, so a tight group gap can cause visual collisions. Use explicit component imports only for the lowercase helpers and type-only exports.

## Examples

**Basic message bubble.**

```vue
<template>
  <UIBubble>
    <UIBubbleContent>I checked the registry output.</UIBubbleContent>
  </UIBubble>
</template>
```

**Start and end alignment.**

```vue
<template>
  <div class="flex w-full max-w-sm flex-col gap-4">
    <UIBubble align="start">
      <UIBubbleContent>Incoming content stays at the start.</UIBubbleContent>
    </UIBubble>
    <UIBubble align="end">
      <UIBubbleContent>Outgoing content moves to the end.</UIBubbleContent>
    </UIBubble>
  </div>
</template>
```

**Variants.**

```vue
<template>
  <div class="flex w-full max-w-sm flex-col gap-4">
    <UIBubble><UIBubbleContent>Default</UIBubbleContent></UIBubble>
    <UIBubble variant="secondary"><UIBubbleContent>Secondary</UIBubbleContent></UIBubble>
    <UIBubble variant="muted"><UIBubbleContent>Muted</UIBubbleContent></UIBubble>
    <UIBubble variant="tinted"><UIBubbleContent>Tinted</UIBubbleContent></UIBubble>
    <UIBubble variant="outline"><UIBubbleContent>Outline</UIBubbleContent></UIBubble>
    <UIBubble variant="ghost"><UIBubbleContent>Ghost content</UIBubbleContent></UIBubble>
    <UIBubble variant="destructive"><UIBubbleContent>Destructive</UIBubbleContent></UIBubble>
  </div>
</template>
```

**Static reactions and an action button.**

```vue
<script setup lang="ts">
import { ref } from 'vue'

const selected = ref(false)
</script>

<template>
  <div class="flex w-full max-w-sm flex-col gap-12">
    <UIBubble variant="muted">
      <UIBubbleContent>The tests passed.</UIBubbleContent>
      <UIBubbleReactions role="img" aria-label="Reaction: thumbs up">
        <span>👍</span>
      </UIBubbleReactions>
    </UIBubble>
    <UIBubble variant="destructive">
      <UIBubbleContent>Run the command again?</UIBubbleContent>
      <UIBubbleReactions side="top" align="start">
        <UIButton
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Confirm rerun"
          :aria-pressed="selected"
          @click="selected = !selected"
        >
          ✓
        </UIButton>
      </UIBubbleReactions>
    </UIBubble>
  </div>
</template>
```

## References

- [shadcn-vue Bubble documentation](https://shadcn-vue.com/docs/components/bubble)
- [shadcn-vue Message documentation](https://shadcn-vue.com/docs/components/message)
- [Reka UI Primitive documentation](https://reka-ui.com/docs/utilities/primitive)
- [Message sibling guide](../message/AGENTS.md)
- [Button sibling guide](../button/AGENTS.md)
