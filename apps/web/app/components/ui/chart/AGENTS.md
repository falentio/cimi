# Chart

A shadcn-vue wrapper around Unovis that supplies chart theming, tooltips, and legends, and the component to reach for when rendering any Unovis chart with shared color tokens.

## Conclusion

Chart is a thin shell, not an abstraction. `ChartContainer` plus `ChartConfig` writes `--color-<key>` CSS variables scoped to the chart, and you compose the actual visualization from Unovis components such as `VisXYContainer`, `VisGroupedBar`, and `VisAxis`. `ChartTooltipContent` pairs with Unovis `VisTooltip` and `VisCrosshair` through `componentToString`, while `ChartLegendContent` reads the config straight from the container context. The gotcha that bites: every series key present in the data needs a matching key in `ChartConfig`, or that series renders with no color and drops out of the tooltip and legend.

## Usage

```vue
<template>
  <UIChartContainer :config="chartConfig" class="min-h-[200px] w-full">
    <VisXYContainer :data="chartData">
      <VisGroupedBar
        :x="(d: Data) => d.date"
        :y="[(d: Data) => d.desktop, (d: Data) => d.mobile]"
        :color="[chartConfig.desktop.color, chartConfig.mobile.color]"
      />
      <UIChartTooltip />
      <UIChartCrosshair
        :template="componentToString(chartConfig, UIChartTooltipContent)"
        :color="[chartConfig.desktop.color, chartConfig.mobile.color]"
      />
    </VisXYContainer>
    <UIChartLegendContent />
  </UIChartContainer>
</template>
```

```ts
import type { ChartConfig } from '@/components/ui/chart'
import { VisGroupedBar, VisXYContainer } from '@unovis/vue'
import {
  ChartContainer,
  ChartTooltip,
  ChartCrosshair,
  componentToString,
} from '@/components/ui/chart'

const chartData = [
  { date: new Date('2024-01-01'), desktop: 186, mobile: 80 },
  { date: new Date('2024-02-01'), desktop: 305, mobile: 200 },
]
type Data = (typeof chartData)[number]

const chartConfig = {
  desktop: { label: 'Desktop', color: 'var(--chart-1)' },
  mobile: { label: 'Mobile', color: 'var(--chart-2)' },
} satisfies ChartConfig
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix. Use `<UIChartContainer>`, `<UIChartTooltipContent>`, `<UIChartLegendContent>`, `<UIChartTooltip>`, `<UIChartCrosshair>` in templates with no import. Never write bare `<ChartContainer>` or `Ui...`.
- Lowercase exports need explicit imports from `@/components/ui/chart`: `componentToString`, `THEMES`, `useChart`, `provideChartContext`. Import the `ChartConfig` type with `import type { ChartConfig } from '@/components/ui/chart'`.
- Unovis components come from `@unovis/vue` through explicit imports in `<script setup>`. Mirror what the docs import: `VisXYContainer`, `VisSingleContainer`, `VisGroupedBar`, `VisStackedBar`, `VisArea`, `VisLine`, `VisDonut`, `VisAxis`, `VisTooltip`, `VisCrosshair`.
- Exports: `ChartContainer`, `ChartTooltipContent`, `ChartLegendContent`, `ChartStyle` (internal), `componentToString`, `THEMES`, `useChart`, `provideChartContext`, `ChartCrosshair` (aliased `VisCrosshair`), `ChartTooltip` (aliased `VisTooltip`).
- `ChartConfig` shape: `{ [key: string]: { label?: string | Component; icon?: string | Component } & ({ color?: string; theme?: never } | { color?: never; theme: Record<'light' | 'dark', string> }) }`. The `color` and `theme` union is mutually exclusive; set one or the other, never both.
- `ChartContainer` props: `config` (required `ChartConfig`), `id`, `class`, `cursor` (`true` shows the crosshair line, default off). `ChartContainer` takes a single root child; that child is your Unovis container.
- `ChartContainer` default slot is scoped and provides `id` and `config`. Read them with `v-slot` when building children that need the raw config.
- `ChartStyle` (rendered inside `ChartContainer`) converts each config entry with a `color` or `theme` into a `--color-<key>` CSS variable under the chart's `data-chart` selector, emitting a light block and a `.dark` block. Reference those tokens in Unovis as `color="var(--color-desktop)"` or per-row as `fill: 'var(--color-chrome)'`.
- `ChartTooltipContent` props: `indicator` (`'dot'` default | `'line'` | `'dashed'`), `hideLabel`, `hideIndicator`, `labelKey`, `nameKey`, `labelFormatter` (`(d: number | Date) => string`), `payload`, `config`, `class`, `color`, `x`. Unglitched values pass through `payload` and `config` from `componentToString`.
- `ChartTooltipContent` filters `payload` entries whose key has no `ChartConfig` match, which is why a missing config key silently drops a tooltip row.
- `ChartTooltipContent` default slot replaces the entire inner markup; keep the label and value markup when overriding unless you intend a full custom layout.
- `ChartLegendContent` props: `nameKey`, `verticalAlign` (`'bottom'` default | `'top'`), `hideIcon`, `class`. It reads `config` from `useChart()` context rather than a prop, so it must live inside `ChartContainer`.
- `ChartLegendContent` derives its entries from `ChartConfig` keys, so give every series a `label` there or the legend shows the raw key.
- `componentToString(config, component, props?)` returns a `(data, x) => string` crosshair template. It renders the Vue component to an HTML string on the client and caches by `id` plus serialized data, so pass it the config and any static tooltip props.
- `THEMES` is `{ light: '', dark: '.dark' }`. The `light` key maps to the empty selector, so a `theme.light` value applies at the root and `theme.dark` under `.dark`.
- `useChart()` reads the container context (`id`, `config`) and throws outside a `ChartContainer`. `provideChartContext` is the internal provider.
- Accessibility: the chart renders as SVG without an accessible summary. Add an `aria-label` or a caption near the chart when the data needs a text alternative.
- The container sets `aspect-video` and full width by default. Override sizing with `class`, for example `min-h-[400px] w-full`, or the chart collapses to the default aspect ratio.

## Examples

```vue
<!-- Intent: bar chart with axes, tooltip, and legend -->
<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisAxis, VisGroupedBar, VisXYContainer } from '@unovis/vue'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'

const chartData = [
  { date: new Date('2024-01-01'), desktop: 186, mobile: 80 },
  { date: new Date('2024-02-01'), desktop: 305, mobile: 200 },
  { date: new Date('2024-03-01'), desktop: 237, mobile: 120 },
]
type Data = (typeof chartData)[number]

const chartConfig = {
  desktop: { label: 'Desktop', color: '#2563eb' },
  mobile: { label: 'Mobile', color: '#60a5fa' },
} satisfies ChartConfig
</script>

<template>
  <UIChartContainer :config="chartConfig" class="min-h-[200px] w-full">
    <VisXYContainer :data="chartData">
      <VisGroupedBar
        :x="(d: Data) => d.date"
        :y="[(d: Data) => d.desktop, (d: Data) => d.mobile]"
        :color="[chartConfig.desktop.color, chartConfig.mobile.color]"
        :rounded-corners="4"
        bar-padding="0.1"
        group-padding="0"
      />
      <VisAxis
        type="x"
        :x="(d: Data) => d.date"
        :tick-line="false"
        :domain-line="false"
        :grid-line="false"
        :tick-format="(d: number) => new Date(d).toLocaleDateString('en-US', { month: 'short' })"
        :tick-values="chartData.map((d) => d.date)"
      />
      <VisAxis
        type="y"
        :tick-format="() => ''"
        :tick-line="false"
        :domain-line="false"
        :grid-line="true"
      />
      <UIChartTooltip />
      <UIChartCrosshair
        :template="
          componentToString(chartConfig, UIChartTooltipContent, {
            labelFormatter(d) {
              return new Date(d).toLocaleDateString('en-US', { month: 'long' })
            },
          })
        "
        :color="[chartConfig.desktop.color, chartConfig.mobile.color]"
      />
    </VisXYContainer>
    <UIChartLegendContent />
  </UIChartContainer>
</template>
```

```vue
<!-- Intent: area chart reading colors from CSS variables -->
<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisArea, VisAxis, VisLine, VisXYContainer } from '@unovis/vue'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'

const chartData = [
  { date: new Date('2024-01-01'), desktop: 186 },
  { date: new Date('2024-02-01'), desktop: 305 },
  { date: new Date('2024-03-01'), desktop: 237 },
]
type Data = (typeof chartData)[number]

const chartConfig = {
  desktop: { label: 'Desktop', color: 'var(--chart-1)' },
} satisfies ChartConfig
</script>

<template>
  <UIChartContainer :config="chartConfig" class="min-h-[200px] w-full">
    <VisXYContainer :data="chartData">
      <VisArea :x="(d: Data) => d.date" :y="(d: Data) => d.desktop" color="var(--color-desktop)" />
      <VisLine :x="(d: Data) => d.date" :y="(d: Data) => d.desktop" color="var(--color-desktop)" />
      <VisAxis type="x" />
      <VisAxis type="y" />
      <UIChartTooltip />
      <UIChartCrosshair :template="componentToString(chartConfig, UIChartTooltipContent)" />
    </VisXYContainer>
  </UIChartContainer>
</template>
```

```vue
<!-- Intent: tooltip with keys mapped from a differently named data field -->
<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { VisSingleContainer, VisDonut } from '@unovis/vue'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'

const chartData = [
  { browser: 'chrome', visitors: 275, fill: 'var(--color-chrome)' },
  { browser: 'safari', visitors: 200, fill: 'var(--color-safari)' },
]

const chartConfig = {
  visitors: { label: 'Total Visitors' },
  chrome: { label: 'Chrome', color: 'var(--chart-1)' },
  safari: { label: 'Safari', color: 'var(--chart-2)' },
} satisfies ChartConfig
</script>

<template>
  <UIChartContainer :config="chartConfig" class="mx-auto aspect-square w-full max-w-[250px]">
    <VisSingleContainer :data="chartData">
      <VisDonut :value="(d: any) => d.visitors" :color="(d: any) => d.fill" />
      <UIChartTooltip />
      <UIChartCrosshair
        :template="
          componentToString(chartConfig, UIChartTooltipContent, {
            labelKey: 'visitors',
            nameKey: 'browser',
          })
        "
      />
    </VisSingleContainer>
  </UIChartContainer>
</template>
```

```vue
<!-- Intent: legend names taken from a custom data key -->
<template>
  <UIChartLegendContent name-key="browser" />
</template>
```

```vue
<!-- Intent: top-aligned legend with hidden icons and dashed indicators -->
<template>
  <UIChartContainer :config="chartConfig" class="min-h-[200px] w-full">
    <VisXYContainer :data="chartData">
      <VisGroupedBar
        :x="(d: Data) => d.date"
        :y="[(d: Data) => d.desktop, (d: Data) => d.mobile]"
      />
    </VisXYContainer>
    <UIChartLegendContent vertical-align="top" hide-icon />
  </UIChartContainer>
</template>
```

## References

- [Chart](./AGENTS.md)
- [shadcn-vue chart docs](https://shadcn-vue.com/docs/components/chart)
- [Unovis Quick Start](https://unovis.dev/docs/quick-start)
- [Unovis Crosshair](https://unovis.dev/docs/components/Crosshair) for crosshair template and CSS variables
- [Unovis Axis](https://unovis.dev/docs/components/Axis) for tick, label, and grid options
- [Card](../card/AGENTS.md) for wrapping charts in a titled panel
