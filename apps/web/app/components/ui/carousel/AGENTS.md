# Carousel

A swipeable, motion-driven slide carousel built on Embla, and the component to reach for when content scrolls through a viewport slide by slide.

## Conclusion

Think of it as a scroll viewport (`Carousel`) holding a flex track (`CarouselContent`) full of slides (`CarouselItem`), with arrow buttons (`CarouselPrevious`/`CarouselNext`) placed inside the `Carousel` but outside the content. `Carousel`, `CarouselContent`, and `CarouselItem` are mandatory and must nest in that order; the two button parts are optional. The gotcha that bites: `CarouselPrevious` and `CarouselNext` are absolutely positioned relative to the `Carousel` root at offsets like `-left-12`, so a parent without breathing room clips them, and the `Carousel` root owns a keyboard handler that hijacks arrow keys.

## Usage

```vue
<template>
  <UICarousel class="w-full max-w-xs">
    <UICarouselContent>
      <UICarouselItem>...</UICarouselItem>
      <UICarouselItem>...</UICarouselItem>
      <UICarouselItem>...</UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix. Use `<UICarousel>`, `<UICarouselContent>`, `<UICarouselItem>`, `<UICarouselPrevious>`, `<UICarouselNext>` in templates with no import. Never write bare `<Carousel...>` or `Ui...`.
- The `useCarousel` composable, the `CarouselApi` type, `CarouselOptions`, `CarouselPlugin`, `CarouselProps`, and `CarouselEmits` need explicit imports from `@/components/ui/carousel`, for example `import { useCarousel } from '@/components/ui/carousel'` and `import type { CarouselApi } from '@/components/ui/carousel'`.
- Embla options and plugins are imported explicitly too, from `embla-carousel-vue` or a plugin package such as `embla-carousel-autoplay`.
- Required nesting: `Carousel` > `CarouselContent` > `CarouselItem`. `CarouselPrevious` and `CarouselNext` render as siblings of `CarouselContent` inside `Carousel`, never inside a slide.
- `Carousel` props: `opts` (Embla options), `plugins` (Embla plugin array), `orientation`, `class`. `orientation` is `'horizontal'` (default) or `'vertical'`, and it drives both the Embla `axis` and every child's layout classes. Never invent other props.
- `Carousel` emits `init-api` with the Embla API once Embla is ready in `onMounted`. `Carousel` also `defineExpose`s `canScrollNext`, `canScrollPrev`, `carouselApi`, `carouselRef`, `orientation`, `scrollNext`, `scrollPrev`, so a template ref on `Carousel` reaches them.
- `Carousel` default slot is scoped and provides `canScrollNext`, `canScrollPrev`, `carouselApi`, `carouselRef`, `orientation`, `scrollNext`, `scrollPrev`. Use `v-slot` to read them.
- `CarouselPrevious` and `CarouselNext` props: `variant` (default `'outline'`), `size` (default `'icon-sm'`), `class`. Each disables itself from `canScrollPrev`/`canScrollNext`. Each has a default slot that replaces the built-in icon plus its `sr-only` label; keep an accessible name when overriding.
- `CarouselContent` and `CarouselItem` take only `class`. `CarouselContent` sets `inheritAttrs: false` and forwards `$attrs` to the inner track, not the viewport.
- Slide width comes from the `basis` utility on `CarouselItem`. Default `basis-full` shows one slide; use `md:basis-1/2`, `lg:basis-1/3`, or `basis-1/3` to show several.
- Slide spacing uses `pl-{n}` on `CarouselItem` with a matching negative `-ml-{n}` on `CarouselContent` (vertical swaps to `pt-{n}`/`-mt-{n}`). Do not use `gap` on the content.
- Embla `opts` values worth knowing: `align` (`'start'` | `'center'` default | `'end'` | callback), `loop` (default `false`), `dragFree` (`true` | `false` | `'snap'`), `slidesToScroll` (number | `'auto'`), `containScroll` (`false` | `'trimSnaps'` default | `'keepSnaps'`), `direction` (`'ltr'` | `'rtl'`), `breakpoints`, `startSnap`, `duration` (20-60 recommended, default `25`). The vue wrapper reinitializes when reactive options change.
- `loop: true` needs enough slides to fill the viewport. Embla silently falls back to `false` when slide content is too short to loop without visible glitches.
- Keyboard gotcha: the `Carousel` root has `tabindex="0"` and a keydown handler with `event.preventDefault()` on arrow keys. Horizontal uses ArrowLeft/ArrowRight, vertical uses ArrowUp/ArrowDown; the other pair still scrolls the page. A vertical carousel therefore traps ArrowUp/ArrowDown for anything inside it.
- Accessibility: `Carousel` root is `role="region"` with `aria-roledescription="carousel"`. Each `CarouselItem` is `role="group"` with `aria-roledescription="slide"`. The built-in buttons carry `sr-only` "Previous slide"/"Next slide" text. Add `aria-label` on `Carousel` to name the region, and an `sr-only` caption on each slide for "Slide N of M".
- Control the carousel through `useCarousel` inside a descendant (`carouselApi`, `scrollPrev`, `scrollNext`, `canScrollPrev`, `canScrollNext`, `orientation`, `carouselRef`), through `@init-api`, or through a template ref on `Carousel`. `useCarousel` throws `useCarousel must be used within a <Carousel />` outside the tree.
- `CarouselApi` is the Embla API. Use it for `on('select' | 'reInit' | 'init', handler)`, `selectedScrollSnap()`, `scrollSnapList()`, `scrollTo()`, `goToPrev()`, `goToNext()`, `plugins()`.
- Autoplay: pass `Autoplay({ delay, stopOnMouseEnter, stopOnInteraction })` into `plugins`, then call `plugin.stop()`, `plugin.reset()`, `plugin.play()` from your own handlers when you need manual control.

## Examples

```vue
<!-- Intent: minimal carousel with slides and nav buttons -->
<template>
  <UICarousel class="w-full max-w-xs">
    <UICarouselContent>
      <UICarouselItem v-for="i in 5" :key="i">
        <UICard>
          <UICardContent class="flex aspect-square items-center justify-center p-6">
            <span class="text-4xl font-semibold">{{ i }}</span>
          </UICardContent>
        </UICard>
      </UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: several slides per view with start alignment -->
<template>
  <UICarousel class="relative w-full max-w-xs" :opts="{ align: 'start' }">
    <UICarouselContent>
      <UICarouselItem v-for="index in 5" :key="index" class="md:basis-1/2 lg:basis-1/3">
        <div class="p-1">{{ index }}</div>
      </UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: custom slide spacing via pl on items and negative ml on content -->
<template>
  <UICarousel class="w-full max-w-sm" :opts="{ align: 'start' }">
    <UICarouselContent class="-ml-1">
      <UICarouselItem v-for="index in 5" :key="index" class="pl-1 md:basis-1/2 lg:basis-1/3">
        <div class="p-1">{{ index }}</div>
      </UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: vertical orientation with a fixed height viewport -->
<template>
  <UICarousel orientation="vertical" class="relative w-full max-w-xs" :opts="{ align: 'start' }">
    <UICarouselContent class="-mt-1 h-[200px]">
      <UICarouselItem v-for="index in 5" :key="index" class="p-1 md:basis-1/2">
        <div class="p-1">{{ index }}</div>
      </UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: infinite looping and drag-free momentum scrolling -->
<template>
  <UICarousel class="w-full max-w-xs" :opts="{ align: 'start', loop: true, dragFree: true }">
    <UICarouselContent>
      <UICarouselItem v-for="index in 8" :key="index">...</UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: autoplay plugin with pause on hover -->
<script setup lang="ts">
import Autoplay from 'embla-carousel-autoplay'

const plugin = Autoplay({ delay: 2000, stopOnMouseEnter: true, stopOnInteraction: false })
</script>

<template>
  <UICarousel
    class="relative w-full max-w-xs"
    :plugins="[plugin]"
    @mouseenter="plugin.stop"
    @mouseleave="plugin.play()"
  >
    <UICarouselContent>
      <UICarouselItem v-for="index in 5" :key="index">...</UICarouselItem>
    </UICarouselContent>
    <UICarouselPrevious />
    <UICarouselNext />
  </UICarousel>
</template>
```

```vue
<!-- Intent: API-controlled slide counter via init-api -->
<script setup lang="ts">
import type { CarouselApi } from '@/components/ui/carousel'
import { ref } from 'vue'

const api = ref<CarouselApi>()
const current = ref(0)
const totalCount = ref(0)

function setApi(val: CarouselApi) {
  api.value = val
  totalCount.value = val.scrollSnapList().length
  current.value = val.selectedScrollSnap() + 1
  val.on('select', () => {
    current.value = val.selectedScrollSnap() + 1
  })
}
</script>

<template>
  <div class="w-full sm:w-auto">
    <UICarousel class="relative w-full max-w-xs" @init-api="setApi">
      <UICarouselContent>
        <UICarouselItem v-for="index in 5" :key="index">...</UICarouselItem>
      </UICarouselContent>
      <UICarouselPrevious />
      <UICarouselNext />
    </UICarousel>
    <div class="py-2 text-center text-sm text-muted-foreground">
      Slide {{ current }} of {{ totalCount }}
    </div>
  </div>
</template>
```

```vue
<!-- Intent: useCarousel composable inside a descendant of Carousel -->
<script setup lang="ts">
import { useCarousel } from '@/components/ui/carousel'

const { scrollNext, scrollPrev, canScrollNext, canScrollPrev } = useCarousel()
</script>

<template>
  <UICarousel class="w-full max-w-xs">
    <UICarouselContent>
      <UICarouselItem v-for="index in 5" :key="index">...</UICarouselItem>
    </UICarouselContent>
    <div class="flex justify-center gap-2">
      <UIButton variant="outline" :disabled="!canScrollPrev" @click="scrollPrev">Prev</UIButton>
      <UIButton variant="outline" :disabled="!canScrollNext" @click="scrollNext">Next</UIButton>
    </div>
  </UICarousel>
</template>
```

## References

- [Carousel](./AGENTS.md)
- [shadcn-vue carousel docs](https://shadcn-vue.com/docs/components/carousel)
- [Card](../card/AGENTS.md) for slide content
- [Button](../button/AGENTS.md) for custom nav triggers
- [embla-carousel-vue](https://www.embla-carousel.com/docs/get-started/vue)
- [Embla Carousel options](https://www.embla-carousel.com/docs/api/options)
- [Embla Carousel methods](https://www.embla-carousel.com/docs/api/methods)
- [Embla Carousel events](https://www.embla-carousel.com/docs/api/events)
- [Embla Carousel plugins](https://www.embla-carousel.com/docs/api/plugins)
