# Message Scroller

Provides a vertical, provider-backed transcript scroller for anchored turns, streamed replies, prepended history, and imperative jumps.

## Conclusion

Use `<UIMessageScrollerProvider>` around one `<UIMessageScroller>`. Put `<UIMessageScrollerViewport>` around `<UIMessageScrollerContent>`, render each direct content child as a `<UIMessageScrollerItem>`, and place an optional `<UIMessageScrollerButton>` beside the viewport. The provider must be an ancestor of every component and composable call.

Set `auto-scroll` when streamed content should follow the bottom edge until the reader scrolls away. Set `scroll-anchor` on the row that starts a new turn. Give every jumpable or visible row a stable `message-id`.

The component owns scroll position and DOM measurement. The parent owns messages, message rendering, streaming state, and transport state.

## Usage

`shadcn-nuxt` auto-registers the six component exports with the `UI` prefix from `apps/web/nuxt.config.ts`. Use these tags in templates without component imports.

- `MessageScroller` becomes `<UIMessageScroller>`.
- `MessageScrollerProvider` becomes `<UIMessageScrollerProvider>`.
- `MessageScrollerViewport` becomes `<UIMessageScrollerViewport>`.
- `MessageScrollerContent` becomes `<UIMessageScrollerContent>`.
- `MessageScrollerItem` becomes `<UIMessageScrollerItem>`.
- `MessageScrollerButton` becomes `<UIMessageScrollerButton>`.

Import lowercase composables explicitly from `@/components/ui/message-scroller`. Import type-only exports explicitly from the same path. Add other script imports only for refs, helpers, types, icons, or third-party APIs used by the page. Prefix any other local UI component tags with `UI` too.

Use this tree for a working transcript. The height-bounded parent is required for scrolling.

```vue
<script setup lang="ts">
import { ref } from 'vue'

type TranscriptMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
}

const messages = ref<TranscriptMessage[]>([
  { id: 'message-1', role: 'user', text: 'Show me the deployment status.' },
  { id: 'message-2', role: 'assistant', text: 'The deployment is healthy.' },
])
</script>

<template>
  <UIMessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <div class="h-96 min-h-0">
      <UIMessageScroller>
        <UIMessageScrollerViewport>
          <UIMessageScrollerContent>
            <UIMessageScrollerItem
              v-for="message in messages"
              :key="message.id"
              :message-id="message.id"
              :scroll-anchor="message.role === 'user'"
            >
              <p>{{ message.text }}</p>
            </UIMessageScrollerItem>
          </UIMessageScrollerContent>
        </UIMessageScrollerViewport>
        <UIMessageScrollerButton direction="end" />
      </UIMessageScroller>
    </div>
  </UIMessageScrollerProvider>
</template>
```

The official guide's composition is `MessageScrollerProvider` containing `MessageScroller`, with `MessageScrollerViewport` containing `MessageScrollerContent` and `MessageScrollerItem`, plus an optional `MessageScrollerButton` sibling. The local Nuxt tags above are the required prefixed form.

## Meaningful Information

- **Barrel exports.** `index.ts` re-exports `MessageScroller`, `MessageScrollerButton`, `MessageScrollerContent`, `MessageScrollerItem`, `MessageScrollerProvider`, and `MessageScrollerViewport`. It also re-exports `useMessageScroller`, `useMessageScrollerScrollable`, and `useMessageScrollerVisibility`.
  The seven type exports are `MessageScrollerButtonDirection`, `MessageScrollerDefaultScrollPosition`, `MessageScrollerProviderProps`, `MessageScrollerScrollable`, `MessageScrollerScrollAlign`, `MessageScrollerScrollOptions`, and `MessageScrollerVisibilityState`.
- **Direct-file exports.** `useMessageScroller.ts` additionally exports `provideMessageScroller`, `useMessageScrollerContext`, `useMessageScrollerRegister`, `MessageScrollerContext`, `RegisterMessage`, and `SCROLL_KEYS`. These are provider and item wiring used by the local components. They are not re-exported by `index.ts`; use the three barrel composables instead.
- **`MessageScroller`.** Accepts only `class?: HTMLAttributes['class']`. It renders the full-size, overflow-hidden root and exposes the default slot for the viewport and button.
- **`MessageScrollerProvider`.** Accepts `MessageScrollerProviderProps` and renders only its default slot. It provides the scroll engine through Vue `provide` and `inject`. It has no DOM root.
- **`MessageScrollerViewport`.** Accepts `class?: HTMLAttributes['class']` and `preserveScrollOnPrepend?: boolean`. `preserveScrollOnPrepend` defaults to `true`. It renders the native vertical scroll container with `role="region"`, `aria-label="Messages"`, and `tabindex="0"`.
- **`MessageScrollerContent`.** Accepts `class?: HTMLAttributes['class']` and `spacerClass?: HTMLAttributes['class']`. It renders a `role="log"` content column with `aria-relevant="additions"`, then appends an internal hidden spacer. Pass `aria-busy` or other fallthrough attributes to this component when the parent owns that state.
- **`MessageScrollerItem`.** Accepts `messageId?: string`, `scrollAnchor?: boolean`, and `class?: HTMLAttributes['class']`. `scrollAnchor` defaults to `false`. It renders a `div` and registers a truthy `messageId` with the provider when it mounts. It updates registration when `messageId` changes and removes it when it unmounts.
- **`MessageScrollerButton`.** Accepts `class?: HTMLAttributes['class']`, `direction?: MessageScrollerButtonDirection`, `behavior?: ScrollBehavior`, `variant?: ButtonVariants['variant']`, and `size?: ButtonVariants['size']`. Defaults are `direction="end"`, `behavior="smooth"`, `variant="secondary"`, and `size="icon-sm"`. It scrolls to the selected edge only while that edge is available.
- **Button variants.** `ButtonVariants['variant']` accepts `default`, `outline`, `secondary`, `ghost`, `destructive`, or `link`. `ButtonVariants['size']` accepts `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, or `icon-lg`. These values come from `@/components/ui/button`.
- **`MessageScrollerDefaultScrollPosition`.** The exact union is `'start' | 'end' | 'last-anchor'`. The provider default is `'end'`. `start` opens at the top. `end` opens at the bottom. `last-anchor` opens at the last anchored row with the previous-item peek when that row needs room. If there is no anchor, the component falls back to `end`.
- **`MessageScrollerButtonDirection`.** The exact union is `'start' | 'end'`. This is vertical direction. `start` means the top of the transcript, and `end` means the bottom.
- **`MessageScrollerScrollAlign`.** The exact union is `'start' | 'center' | 'end' | 'nearest'`. It controls where `scrollToMessage` places the target row. `start` is the default. `nearest` keeps a fully visible row in place and otherwise moves it to the nearest edge.
- **`MessageScrollerScrollOptions`.** The exact interface is `{ align?: MessageScrollerScrollAlign; behavior?: ScrollBehavior; scrollMargin?: number }`. `behavior` defaults to `'auto'` for `scrollToMessage`. `scrollMargin` defaults to the provider's `scrollMargin`, which is `0`. `ScrollBehavior` is the DOM type with the values `'auto' | 'instant' | 'smooth'`.
- **`MessageScrollerProviderProps`.** The exact interface is `{ autoScroll?: boolean; defaultScrollPosition?: MessageScrollerDefaultScrollPosition; scrollEdgeThreshold?: number; scrollPreviousItemPeek?: number; scrollMargin?: number }`. Defaults are `autoScroll: false`, `defaultScrollPosition: 'end'`, `scrollEdgeThreshold: 8`, `scrollPreviousItemPeek: 64`, and `scrollMargin: 0`. Numeric values are pixel distances.
- **`MessageScrollerScrollable`.** The exact interface is `{ start: boolean; end: boolean }`. `start` is `true` when the viewport can scroll toward the top beyond `scrollEdgeThreshold`. `end` is `true` when it can scroll toward the bottom beyond that threshold. When auto-scroll follows the live edge, `end` is reported as unavailable.
- **`MessageScrollerVisibilityState`.** The exact interface is `{ currentAnchorId: string | null; visibleMessageIds: string[] }`. `currentAnchorId` is the latest anchored row at or above the anchor line. It remains set after that row moves above the viewport. `visibleMessageIds` contains visible registered IDs in document order. Rows without `messageId` do not enter either result.
- **`useMessageScroller`.** Call this in the setup of a descendant of `<UIMessageScrollerProvider>`. It returns `scrollToStart`, `scrollToEnd`, and `scrollToMessage`. The edge methods accept `{ behavior?: ScrollBehavior }` and return `boolean`. `scrollToMessage(messageId, options?)` accepts `MessageScrollerScrollOptions` and returns `true` when it handles or queues the request. It returns `false` when the requested ID is absent after rows already exist. A request made before any rows exist can queue for a later registration.
- **`useMessageScrollerScrollable`.** Returns `Ref<MessageScrollerScrollable>`. The ref updates after scroll, content, and resize changes. Use `scrollable.value.start` and `scrollable.value.end` in script code. Prefer the scroller's `data-scrollable` attribute for CSS.
- **`useMessageScrollerVisibility`.** Returns `Ref<MessageScrollerVisibilityState>`. The composable subscribes to visibility tracking when called and releases that subscription when its Vue scope disposes. Visibility tracking uses `IntersectionObserver` when available and a rectangle check otherwise.
- **Scroll direction.** The viewport uses `overflow-y-auto` and `scrollTop`. The component does not implement horizontal scrolling. Button `start` and `end` values refer to the top and bottom edges.
- **Turn anchoring.** A newly appended item with `scrollAnchor` moves near the top with `scrollMargin` plus `scrollPreviousItemPeek` applied to the position. The internal spacer preserves room while the anchored reply grows. Anchoring is independent of message role. A marker or another row can be an anchor.
- **Auto-scroll.** `autoScroll` follows the bottom while the reader is at the live edge. Wheel, touch, and the viewport's scroll keys count as user intent and release the view when the reader moves away. New content and resize changes then preserve the reader's position until the reader returns to the end.
- **Prepended history.** `preserveScrollOnPrepend` keeps the first visible registered row at the same viewport position when older direct child items are inserted above it. Set it to `false` when the parent wants normal browser scroll behavior.
- **Default position timing.** The provider applies `defaultScrollPosition` once when the first content becomes available. Changing that prop later does not reposition an existing transcript. Remount the provider when a saved-thread opening position must be reapplied.
- **Data attributes.** The scroller and viewport expose `data-scrollable` as `start`, `end`, `start end`, or no attribute. They expose an empty `data-autoscrolling` attribute during a programmatic scroll. Items expose `data-message-id` and `data-scroll-anchor="true"` or `"false"`. The button exposes `data-direction` and `data-active="true"` or `"false"`. The content spacer exposes `data-message-scroller-spacer`.
- **Slots and events.** Every component has one unnamed default slot. No component declares `v-model` or custom emitted events. Use parent-owned refs for messages and streaming state. Use the composables for scroll commands and state. The viewport's internal `scroll`, `wheel`, `touchmove`, and `keydown` listeners keep the engine synchronized.
- **Keyboard access.** The viewport is focusable and keeps native vertical scroll behavior. The source `SCROLL_KEYS` set is exactly `new Set(['ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp', ' '])`. The `' '` value is the Space key. These keys mark keyboard movement as user intent. The component does not replace those native key actions. Keep the default `aria-label="Messages"` unless the surrounding interface needs a more specific label.
- **Accessibility.** The viewport is a labelled region. The content is a live log that marks additions as relevant. The default button slot contains an icon and a screen-reader-only label. An inactive button becomes `inert`, receives `tabindex="-1"`, and has `data-active="false"`. If you replace the button slot, provide an accessible name yourself.
- **Animation.** Animate a newly added row with `transform` and `opacity`. Avoid animating height, margin, or padding because the observers measure those properties while anchoring and auto-scroll are active.
- **Composition gotchas.** Keep `UIMessageScrollerItem` as a direct child of `UIMessageScrollerContent`. The content observer measures its direct element children and ignores only the internal spacer. Put message, bubble, marker, and status markup inside the item slot.
- **Identity gotchas.** Use unique, stable `messageId` values. Without an ID, a row can still anchor, but jumps and visibility state cannot identify it. Keep the Vue `:key` aligned with the same stable ID.
- **Provider errors.** `MessageScroller`, `MessageScrollerButton`, and the public composables throw when no provider is available. Put controls that call a composable in a child component rendered below `<UIMessageScrollerProvider>`. A provider in the same component's template is too low for that component's setup call.
- **Layout gotchas.** Give the provider's content area a constrained height. Add `min-h-0` through flex parents when needed. Without a height bound, the viewport grows with its content and has nothing to scroll.
- **Browser observers.** The component uses `MutationObserver`, `ResizeObserver`, and `IntersectionObserver` when the browser provides them. The scroll engine still has a geometry fallback for visibility, but a layout that depends on observer callbacks can behave differently in a browser or test environment without those APIs.
- **Documentation boundary.** The official page documents usage, composition, turn anchoring, live-edge behavior, history loading, imperative jumps, visibility, scroll state, props, and the three public composables. It does not specify the local `UI` prefix, source-level fallthrough attributes, keyboard keys, `v-model` and event behavior, or the direct-child and provider setup gotchas. The local source is authoritative for those details.

## Examples

Use a stable ID and mark the first row of each turn as the anchor.

```vue
<template>
  <UIMessageScrollerProvider auto-scroll :scroll-previous-item-peek="48">
    <div class="h-96 min-h-0">
      <UIMessageScroller>
        <UIMessageScrollerViewport>
          <UIMessageScrollerContent aria-live="polite">
            <UIMessageScrollerItem message-id="turn-1-user" scroll-anchor>
              <p>Can you check the queue?</p>
            </UIMessageScrollerItem>
            <UIMessageScrollerItem message-id="turn-1-assistant">
              <p>The queue is recovering.</p>
            </UIMessageScrollerItem>
          </UIMessageScrollerContent>
        </UIMessageScrollerViewport>
        <UIMessageScrollerButton />
      </UIMessageScroller>
    </div>
  </UIMessageScrollerProvider>
</template>
```

Put imperative controls in a child component under the provider. Import the composable and option type explicitly.

```vue
<script setup lang="ts">
import { useMessageScroller } from '@/components/ui/message-scroller'
import type { MessageScrollerScrollOptions } from '@/components/ui/message-scroller'

const { scrollToMessage, scrollToStart, scrollToEnd } = useMessageScroller()
const centeredJump: MessageScrollerScrollOptions = {
  align: 'center',
  behavior: 'smooth',
  scrollMargin: 16,
}
</script>

<template>
  <nav aria-label="Transcript controls">
    <button type="button" @click="scrollToStart({ behavior: 'smooth' })">First message</button>
    <button type="button" @click="scrollToMessage('turn-1-assistant', centeredJump)">
      Find reply
    </button>
    <button type="button" @click="scrollToEnd({ behavior: 'smooth' })">Latest message</button>
  </nav>
</template>
```

Read edge state and visibility from another child component under the same provider.

```vue
<script setup lang="ts">
import { computed } from 'vue'
import {
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller'

const scrollable = useMessageScrollerScrollable()
const visibility = useMessageScrollerVisibility()
const status = computed(() => {
  if (scrollable.value.start && scrollable.value.end) return 'Both directions are available.'
  if (scrollable.value.end) return 'Only older messages are available.'
  if (scrollable.value.start) return 'Only newer messages are available.'
  return 'All messages fit in the viewport.'
})
</script>

<template>
  <p>{{ status }}</p>
  <p>Current turn: {{ visibility.currentAnchorId ?? 'none' }}</p>
  <p>Visible messages: {{ visibility.visibleMessageIds.join(', ') || 'none' }}</p>
</template>
```

## References

- [shadcn-vue Message Scroller documentation](https://shadcn-vue.com/docs/components/message-scroller)
- [Button sibling guide](../button/AGENTS.md)
- [Message sibling guide](../message/AGENTS.md)
