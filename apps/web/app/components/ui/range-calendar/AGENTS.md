# Range Calendar

Provides a styled, accessible calendar for selecting one date range.

## Conclusion

`<UIRangeCalendar>` is a fully composed Reka UI range calendar. It renders the header, navigation buttons, weekday row, month grids, cells, and cell triggers. It forwards the Reka root props and events, but it does not expose a slot for replacement content. Use `v-model` for a controlled range and `default-value` for an uncontrolled initial range. Dates use `@internationalized/date` values rather than native `Date` objects.

## Usage

```vue
<template>
  <UIRangeCalendar />
</template>
```

## Meaningful Information

- **Exports.** `index.ts` exports `RangeCalendar`, `RangeCalendarCell`, `RangeCalendarCellTrigger`, `RangeCalendarGrid`, `RangeCalendarGridBody`, `RangeCalendarGridHead`, `RangeCalendarGridRow`, `RangeCalendarHeadCell`, `RangeCalendarHeader`, `RangeCalendarHeading`, `RangeCalendarNextButton`, and `RangeCalendarPrevButton`.
- **Nuxt tags.** Shadcn-Nuxt prefixes these exports with `UI`. Use `<UIRangeCalendar>`, `<UIRangeCalendarHeader>`, `<UIRangeCalendarHeading>`, `<UIRangeCalendarPrevButton>`, `<UIRangeCalendarNextButton>`, `<UIRangeCalendarGrid>`, `<UIRangeCalendarGridHead>`, `<UIRangeCalendarGridBody>`, `<UIRangeCalendarGridRow>`, `<UIRangeCalendarHeadCell>`, `<UIRangeCalendarCell>`, and `<UIRangeCalendarCellTrigger>`. Do not import these components in a template. Prefix any other local UI component with `UI` as well.
- **Types and helpers.** Lowercase helpers such as `ref` and date helpers need explicit imports. Import `DateRange` as a type from `reka-ui`. Import `DateValue`, `CalendarDate`, `today`, and `getLocalTimeZone` from `@internationalized/date` when you use them.
- **Range value.** A completed `DateRange` has the shape `{ start: DateValue, end: DateValue }`. The root starts with `{ start: undefined, end: undefined }` when no range is selected. A controlled `modelValue` can also be `null`. Use `DateRange` from `reka-ui` rather than defining a parallel type.
- **Controlled state.** Bind `v-model` to `modelValue`, or listen for `@update:model-value`. Use `defaultValue`, written as `default-value` in templates, when the component owns the selection after its initial value. The root emits `update:modelValue` with a `DateRange`, `update:placeholder` with a `DateValue`, `update:startValue` with a `DateValue`, and `update:validModelValue` with a `DateRange`. In templates, use `@update:start-value` and `@update:valid-model-value` for the last two events.
- **Placeholder.** `defaultPlaceholder`, written as `default-placeholder` in templates, sets the initial visible date when no range is selected. `placeholder` controls the visible date and changes as the user navigates. Bind `v-model:placeholder` or handle `@update:placeholder` when the visible month must stay in external state.
- **Date limits.** `minValue` and `maxValue`, written as `min-value` and `max-value` in templates, restrict selectable dates. `maximumDays` limits the length of a range. `fixedDate` fixes either the `start` or `end` side of the range.
- **Date matchers.** `isDateDisabled`, written as `is-date-disabled` in templates, receives a `DateValue` and blocks selection for matching dates. `isDateUnavailable` marks matching dates as unavailable and renders the `data-unavailable` state. `isDateHighlightable` controls whether a date can be highlighted while the user selects a range. Set `allowNonContiguousRanges`, written as `allow-non-contiguous-ranges` in templates, when a range may contain unavailable dates. `disableDaysOutsideCurrentView` disables days rendered from adjacent months.
- **Root state.** `disabled` disables the calendar. `readonly` prevents changes while preserving the calendar view. `preventDeselect`, written as `prevent-deselect` in templates, prevents removing a selected date without selecting another date first. `initialFocus` focuses the selected day, today, or the first visible day when the calendar mounts.
- **Months and navigation.** `numberOfMonths`, written as `number-of-months` in templates, controls how many month grids render and defaults to `1`. `fixedWeeks` gives every month six calendar rows. `pagedNavigation` makes the previous and next buttons move by the displayed month count instead of one month. `prevPage` and `nextPage` can replace the default page calculations.
- **Locale and direction.** `locale` formats dates and weekdays. `weekdayFormat` accepts `narrow`, `short`, or `long` and defaults to `narrow`. `weekStartsOn` accepts `0` through `6`. `dir` accepts `ltr` or `rtl`. Use `calendarLabel` for the accessible calendar label.
- **Other root props.** `as` changes the rendered root element. `asChild` enables Reka UI's child composition behavior. These props and the component `class` are forwarded to the Reka root. The local root adds `data-slot="range-calendar"` and `p-3`.
- **Multiple and layout.** This component selects one range and does not export or add a `multiple` prop. `layout` and `LayoutTypes` belong to the local Calendar component, not this directory. The range-calendar `index.ts` exports no `LayoutTypes`. Use `number-of-months`, classes, or a source change when the composed layout needs to change.
- **Default composition.** The root renders `<UIRangeCalendarHeader>` with `<UIRangeCalendarHeading>`, `<UIRangeCalendarPrevButton>`, and `<UIRangeCalendarNextButton>`. It renders one `<UIRangeCalendarGrid>` for each month. Each grid contains `<UIRangeCalendarGridHead>`, `<UIRangeCalendarGridBody>`, `<UIRangeCalendarGridRow>`, `<UIRangeCalendarHeadCell>`, `<UIRangeCalendarCell>`, and `<UIRangeCalendarCellTrigger>`. `UIRangeCalendarCell` requires `date`. `UIRangeCalendarCellTrigger` requires `day` and `month`, and renders as a `button` by default.
- **Subcomponent slots.** `UIRangeCalendarHeader`, `UIRangeCalendarGrid`, `UIRangeCalendarGridHead`, `UIRangeCalendarGridBody`, `UIRangeCalendarGridRow`, `UIRangeCalendarHeadCell`, and `UIRangeCalendarCell` expose a default slot for their child content. `UIRangeCalendarHeading` exposes a default slot with `{ headingValue }`. `UIRangeCalendarPrevButton` and `UIRangeCalendarNextButton` expose a default slot that replaces their default Hugeicons arrow. `UIRangeCalendarCellTrigger` exposes a default slot for the day content.
- **Root slots.** The Reka root provides `date`, `grid`, `weekDays`, `weekStartsOn`, `locale`, `fixedWeeks`, and `modelValue` slot data. The local component consumes `grid` and `weekDays` internally and does not render a slot, so callers cannot use those slots through `<UIRangeCalendar>`.
- **Custom composition.** The exported subcomponents are context-bound and the local index does not export the Reka root primitive. Do not place the subcomponents inside `<UIRangeCalendar>` expecting them to replace its internal tree. A structural custom layout requires changing this wrapper or adding a separate wrapper that owns the Reka root.
- **State attributes.** The root and grid expose `data-readonly`, `data-disabled`, and `data-invalid` when applicable. Cell triggers expose `data-selected`, `data-value`, `data-disabled`, `data-unavailable`, `data-today`, `data-outside-view`, `data-outside-visible-view`, `data-selection-start`, `data-selection-end`, `data-highlighted`, `data-highlighted-start`, `data-highlighted-end`, and `data-focused`. The local cell styles use selection-start and selection-end attributes to round range edges.
- **Keyboard and accessibility.** Reka UI manages focus and keyboard navigation. Tab moves focus to the first navigation button. Enter or Space navigates when a navigation button is focused and selects the date when a cell trigger is focused. Arrow keys move between dates and change the visible month when needed. Keep the semantic grid subcomponents when changing styles, and provide `calendar-label` when the surrounding context does not name the calendar.
- **Styling.** The root has `p-3`. The header centers its content. The month wrapper stacks months below the `sm` breakpoint and lays them out in a row at `sm` and above. Navigation buttons use outline button styles with `size-7`. Cell triggers use `size-8`, and unavailable dates use a destructive, struck-through style.
- **Gotchas.** `defaultPlaceholder` is not a controlled navigation value. Use `placeholder` with `v-model:placeholder` when another control must drive the visible month. `isDateDisabled` and `isDateUnavailable` are different states. An unavailable date can prevent a contiguous range unless `allowNonContiguousRanges` is enabled. The wrapper exposes `PrevButton` and `NextButton` names, not the upstream `Prev` and `Next` names.

## Examples

**Single range with an initial value.** `default-value` seeds an uncontrolled range.

```vue
<script setup lang="ts">
import type { DateRange } from 'reka-ui'
import { CalendarDate } from '@internationalized/date'

const initialStart = new CalendarDate(2026, 9, 15)
const initialRange: DateRange = {
  start: initialStart,
  end: new CalendarDate(2026, 9, 22),
}
</script>

<template>
  <UIRangeCalendar
    :default-value="initialRange"
    :default-placeholder="initialStart"
    class="rounded-md border shadow-sm"
  />
</template>
```

**Controlled range and visible month.** `v-model` controls the selection and `v-model:placeholder` controls navigation state.

```vue
<script setup lang="ts">
import type { DateRange } from 'reka-ui'
import { CalendarDate } from '@internationalized/date'
import { ref } from 'vue'

const range = ref<DateRange | null>({
  start: new CalendarDate(2026, 9, 15),
  end: new CalendarDate(2026, 9, 22),
})
const placeholder = ref(new CalendarDate(2026, 9, 1))
</script>

<template>
  <UIRangeCalendar
    v-model="range"
    v-model:placeholder="placeholder"
    :number-of-months="2"
    :paged-navigation="true"
  />
</template>
```

**Disabled and unavailable dates.** Matchers receive `DateValue` objects.

```vue
<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import type { DateRange } from 'reka-ui'
import { ref } from 'vue'

const range = ref<DateRange | null>(null)
const isDateDisabled = (date: DateValue) => date.day % 2 === 0
const isDateUnavailable = (date: DateValue) => date.day === 15
</script>

<template>
  <UIRangeCalendar
    v-model="range"
    :is-date-disabled="isDateDisabled"
    :is-date-unavailable="isDateUnavailable"
  />
</template>
```

The local wrapper does not expose structural composition, so a runnable custom-layout example is not available. Use the exported subcomponents only after the wrapper owns or exposes a Reka range-calendar root.

## References

- [Calendar](../calendar/AGENTS.md)
- [Button](../button/AGENTS.md)
- [shadcn-vue Range Calendar](https://shadcn-vue.com/docs/components/range-calendar)
- [Reka UI Range Calendar](https://reka-ui.com/docs/components/range-calendar)
- [@internationalized/date](https://react-spectrum.adobe.com/internationalized/date/index.html)
