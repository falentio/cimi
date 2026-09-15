# Message

Provides a presentational conversation row with optional avatar, header, content, footer, and sender alignment.

## Conclusion

Use `<UIMessage>` for one conversation row. Put `<UIMessageAvatar>` and `<UIMessageContent>` inside it. Put the visible message surface, usually `<UIBubble>` with `<UIBubbleContent>`, inside `<UIMessageContent>`. Use `align="end"` for the opposite side of the conversation. Wrap consecutive rows from one sender in `<UIMessageGroup>`.

The components only lay out their slots. They do not fetch messages, manage streaming state, provide a message variant, or emit component events.

## Usage

`shadcn-nuxt` auto-imports the six component exports with the `UI` prefix configured in `apps/web/nuxt.config.ts`. Use the following tags in templates without importing the components.

- `Message` becomes `<UIMessage>`.
- `MessageAvatar` becomes `<UIMessageAvatar>`.
- `MessageHeader` becomes `<UIMessageHeader>`.
- `MessageContent` becomes `<UIMessageContent>`.
- `MessageFooter` becomes `<UIMessageFooter>`.
- `MessageGroup` becomes `<UIMessageGroup>`.

The usual composition is a message row with an avatar and a content wrapper. Keep the avatar and content as children of the message, and keep the header, visible surface, and footer as children of the content wrapper.

```vue
<template>
  <UIMessage>
    <UIMessageAvatar>
      <UIAvatar>
        <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
        <UIAvatarFallback>CN</UIAvatarFallback>
      </UIAvatar>
    </UIMessageAvatar>
    <UIMessageContent>
      <UIBubble>
        <UIBubbleContent>How can I help you today?</UIBubbleContent>
      </UIBubble>
    </UIMessageContent>
  </UIMessage>
</template>
```

The `message` barrel has no lowercase helper exports or type-only exports. Add script imports only for refs, helpers, types, icons, or third-party APIs needed by the example. Do not import these UI components into a Nuxt template.

## Meaningful Information

- **Exports.** `index.ts` exports `Message`, `MessageAvatar`, `MessageContent`, `MessageFooter`, `MessageGroup`, and `MessageHeader`. Each export is a Vue component re-exported from its matching `.vue` file.
- **Shared props.** Every part extends Reka UI `PrimitiveProps` and accepts `as`, `as-child`, and `class`. Each part renders a `div` by default. `as` accepts an element name or component. `as-child` defaults to `false` and merges the part's attributes and classes onto its single default-slot child. `class` adds classes to the part.
- **`Message` props.** `align` accepts `"start"` or `"end"` and defaults to `"start"`. `as`, `as-child`, and `class` use the shared behavior.
- **Other part props.** `MessageAvatar`, `MessageContent`, `MessageHeader`, `MessageFooter`, and `MessageGroup` have no component-specific props. They accept the shared props only.
- **Variants.** `align` is the only enum owned by this component set. There is no `messageVariants` helper, `MessageVariants` type, or `variant` prop in the local barrel. Set `variant` on a nested `<UIBubble>` instead. The supported Bubble variants come from the Bubble component, not Message.
- **Slots.** Every part exposes one unnamed default slot. No part exposes named slots, slot props, `v-model`, or custom emitted events. `UIMessage` receives avatar and content parts. `UIMessageContent` receives the header, message surface, footer, status marker, or other content. `UIMessageGroup` receives `UIMessage` rows.
- **Message layout.** `UIMessage` renders `data-slot="message"`, `data-align="start"` or `data-align="end"`, and a `group/message` scope. It is a full-width flex row. `align="end"` reverses the row so the avatar and content sit on the opposite side.
- **Avatar layout.** `UIMessageAvatar` renders `data-slot="message-avatar"`. It aligns to the bottom of the row. When the message contains a footer, the avatar shifts upward so it stays beside the message surface instead of the footer. Put the actual image and fallback inside a sibling `<UIAvatar>`.
- **Content layout.** `UIMessageContent` renders `data-slot="message-content"`. It stacks its default-slot children and wraps long words. On an end-aligned message, its direct `data-slot` children move to the end and footer actions justify to the end. Keep `UIMessageHeader`, `<UIBubble>`, and `UIMessageFooter` direct children when you need that alignment.
- **Header layout.** `UIMessageHeader` renders `data-slot="message-header"`. Use it for sender names or other metadata above the visible message surface.
- **Footer layout.** `UIMessageFooter` renders `data-slot="message-footer"`. Use it for delivery status, read status, retry controls, copy controls, feedback controls, or other message actions. It follows the message side, and end-aligned actions justify to the end.
- **Group layout.** `UIMessageGroup` renders `data-slot="message-group"` and stacks its message rows vertically. In a consecutive group, render an empty `<UIMessageAvatar />` on earlier rows so the final row's avatar does not change the text column position.
- **Data attributes.** The `data-slot` values are `message`, `message-avatar`, `message-content`, `message-header`, `message-footer`, and `message-group`. The root's `data-align` mirrors `align`. These attributes drive the component's descendant selectors. Preserve the composition when relying on its alignment and footer spacing.
- **Roles and native attributes.** No Message part sets a `role` by default. The underlying Primitive renders the chosen `as` element and forwards applicable native and ARIA attributes. Add a semantic element or a role at the boundary that owns the meaning. Use `role="status"` on a changing status marker such as `<UIMarker>` so assistive technology can announce it.
- **Accessibility.** The Message parts are presentational layout wrappers. Give nested avatar images useful `alt` text. Give icon-only footer buttons an `aria-label` and a `title` when the surrounding UI needs a visible tooltip. Keep status text in readable content instead of relying on an icon.
- **State and events.** The parts declare no `v-model` bindings and no custom events. Keep message text and streaming state in the parent. Native listeners such as `@click` can target a rendered root, but interactive controls usually belong in `UIMessageFooter`.
- **Assistant and streaming messages.** The official component supports assistant messages, reasoning steps, and tool calls through ordinary slot content. Update the parent-owned content while a response streams. Add a status marker for progress. Message does not parse tokens, coordinate tool calls, or decide when streaming ends.
- **`as-child` constraints.** Use `as-child` only when the default slot has one root element or component. The child receives the part's classes and attributes. Use `as` when you need a different root element without replacing it with a slotted child.
- **Styling gotchas.** `MessageHeader` and `MessageFooter` use the `group/message` scope. A nested `<UIBubble variant="ghost">` changes their horizontal padding through a descendant selector. Do not pass `variant` to `<UIMessage>`. A wrapper around direct content parts can prevent the alignment selectors from reaching the intended element.
- **Local source wins.** The local implementation is six thin wrappers around Reka UI `Primitive`. Read `index.ts` and the matching `.vue` file before assuming an upstream export, prop, role, event, or variant exists here.

## Examples

Use `align="end"` for a message on the opposite side. Header and footer are optional.

```vue
<template>
  <UIMessage align="end" aria-label="Olivia's message">
    <UIMessageContent>
      <UIMessageHeader>Olivia</UIMessageHeader>
      <UIBubble>
        <UIBubbleContent>I already checked the logs.</UIBubbleContent>
      </UIBubble>
      <UIMessageFooter>
        <span>Read Yesterday</span>
      </UIMessageFooter>
    </UIMessageContent>
  </UIMessage>
</template>
```

Use an empty avatar on earlier rows in a group to preserve the final avatar's column.

```vue
<template>
  <UIMessageGroup>
    <UIMessage>
      <UIMessageAvatar />
      <UIMessageContent>
        <UIBubble variant="muted">
          <UIBubbleContent>I checked the registry addresses.</UIBubbleContent>
        </UIBubble>
      </UIMessageContent>
    </UIMessage>
    <UIMessage>
      <UIMessageAvatar>
        <UIAvatar>
          <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
          <UIAvatarFallback>CN</UIAvatarFallback>
        </UIAvatar>
      </UIMessageAvatar>
      <UIMessageContent>
        <UIBubble variant="muted">
          <UIBubbleContent>The component is in the UI registry.</UIBubbleContent>
        </UIBubble>
      </UIMessageContent>
    </UIMessage>
  </UIMessageGroup>
</template>
```

Put message actions in the footer. An icon-only action needs an accessible name.

```vue
<template>
  <UIMessage>
    <UIMessageContent>
      <UIBubble variant="muted">
        <UIBubbleContent>The install failure is in the workspace package.</UIBubbleContent>
      </UIBubble>
      <UIMessageFooter class="gap-2">
        <UIButton variant="ghost" size="sm">Copy</UIButton>
        <UIButton variant="ghost" size="icon" aria-label="Retry" title="Retry"> + </UIButton>
      </UIMessageFooter>
    </UIMessageContent>
  </UIMessage>
</template>
```

Keep streaming state in the parent and announce changing status text with `role="status"`.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const answer = ref('The build is ready.')
const isStreaming = ref(true)
</script>

<template>
  <UIMessage>
    <UIMessageContent>
      <UIBubble>
        <UIBubbleContent>{{ answer }}</UIBubbleContent>
      </UIBubble>
      <UIMarker v-if="isStreaming" role="status">
        <UIMarkerContent>Assistant is typing...</UIMarkerContent>
      </UIMarker>
    </UIMessageContent>
  </UIMessage>
</template>
```

## References

- [shadcn-vue Message documentation](https://shadcn-vue.com/docs/components/message)
- [shadcn-vue Bubble documentation](https://shadcn-vue.com/docs/components/bubble)
- [shadcn-vue Marker documentation](https://shadcn-vue.com/docs/components/marker)
- [Avatar sibling guide](../avatar/AGENTS.md)
- [Button sibling guide](../button/AGENTS.md)
- [Marker sibling guide](../marker/AGENTS.md)
- [Reka UI Primitive documentation](https://reka-ui.com/docs/utilities/primitive)
