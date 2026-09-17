# Calendar

Displays a date grid for selecting one or more dates, and it arrives fully composed so you can render `<UICalendar>` alone instead of assembling parts.

## Conclusion

`<UICalendar>` is the reka-ui CalendarRoot plus an opinionated header and month grid, and it renders every sub-part (header, nav buttons, weekdays, cells) for you. Reach for the exported sub-components only when you need a custom layout, since the composed default already covers month and range display. The one gotcha is the calendar system: pass `placeholder` or `defaultPlaceholder` whenever the locale is not Gregorian, because emitted dates otherwise default to the `gregory` calendar.

## Usage

```vue
<template>
  <UICalendar v-model="date" class="rounded-md border shadow-sm" layout="month-and-year" />
</template>
```

## Meaningful Information

- Exports from `@/components/ui/calendar`: `Calendar`, `CalendarCell`, `CalendarCellTrigger`, `CalendarGrid`, `CalendarGridBody`, `CalendarGridHead`, `CalendarGridRow`, `CalendarHeadCell`, `CalendarHeader`, `CalendarHeading`, `CalendarNextButton`, `CalendarPrevButton`.
- Auto-import prefix is `UI`, so tags are `<UICalendar>`, `<UICalendarCell>`, `<UICalendarCellTrigger>`, `<UICalendarGrid>`, `<UICalendarGridBody>`, `<UICalendarGridHead>`, `<UICalendarGridRow>`, `<UICalendarHeadCell>`, `<UICalendarHeader>`, `<UICalendarHeading>`, `<UICalendarNextButton>`, `<UICalendarPrevButton>`.
- `LayoutTypes = 'month-and-year' | 'month-only' | 'year-only' | undefined` exports as a type, so import it explicitly with `import type { LayoutTypes } from '@/components/ui/calendar'`.
- `layout` accepts only those three strings or `undefined`; `undefined` renders the plain `<UICalendarHeading>`. It is a local addition, not a reka-ui prop.
- `yearRange?: DateValue[]` is a local addition; omit it and the year select spans 100 years before the placeholder through 10 years after, clamped by `minValue` and `maxValue`.
- Root props come from `CalendarRootProps`: `modelValue`, `defaultValue`, `placeholder`, `defaultPlaceholder`, `locale`, `numberOfMonths`, `disabled`, `readonly`, `multiple`, `fixedWeeks`, `initialFocus`, `pagedNavigation`, `preventDeselect`, `disableDaysOutsideCurrentView`, `weekStartsOn`, `weekdayFormat`, `minValue`, `maxValue`, `isDateDisabled`, `isDateUnavailable`, `prevPage`, `nextPage`, `calendarLabel`, `dir`, `as`, `asChild`.
- `weekdayFormat` accepts `'narrow' | 'short' | 'long'` and defaults to `'narrow'`; `weekStartsOn` accepts `0` through `6`.
- Root events are `update:modelValue` and `update:placeholder`; the calendar writes the placeholder internally while navigating, so `defaultPlaceholder` alone is enough for month and year selects.
- Range selection uses the `multiple` prop with an array `modelValue`; single-date selection uses a `DateValue | null` model. `disabled` and `readonly` block interaction, while `isDateDisabled` and `isDateUnavailable` disable individual days.
- `calendar-heading` slot receives `{ date, month, year }`, where `month` and `year` are renderable components that emit a native select. Override only the heading, not the whole header.
- `calendar-prev-icon` and `calendar-next-icon` slots replace the default arrow icons inside the nav buttons.
- `CalendarCellTrigger` requires both `day` and `month` props; `CalendarCell` requires `date`.
- `CalendarCellTrigger` renders as `button` by default, and the disabled, unavailable, today, selected, and outside-view states surface as `data-*` attributes for styling rather than slots.
- `CalendarHeading` exposes an internal `headingValue` string through its default slot.
- `CalendarPrevButton` and `CalendarNextButton` accept a `prevPage` / `nextPage` prop that overrides the root navigation function.
- Every sub-component forwards `class` through `cn`, so layout overrides target the wrapper, not internal markup; customize cell hit area with `**:data-[slot=calendar-cell-trigger]:size-12`.
- The root inserts a `data-slot="calendar"` attribute and the buttons are `size-7` outline variants by default.
- Keyboard interaction covers arrow keys, page up and down for months and years, Home and End for week and month bounds, and Enter or Space to select; the reka-ui primitive supplies these, so do not reimplement navigation.

## Examples

```vue
<!-- Simplest single-date calendar bound to a DateValue ref -->
<template>
  <UICalendar v-model="date" class="rounded-md border shadow-sm" />
</template>
```

```vue
<!-- Month and year selectors with a bounded year range -->
<template>
  <UICalendar
    v-model="date"
    layout="month-and-year"
    :default-placeholder="today(getLocalTimeZone())"
    :min-value="new CalendarDate(1925, 1, 1)"
    :max-value="new CalendarDate(2035, 1, 1)"
  />
</template>
```

```vue
<!-- Disabling individual dates with the isDateDisabled matcher -->
<template>
  <UICalendar v-model="date" :is-date-disabled="(d) => d.day % 2 === 0" />
</template>
```

```vue
<!-- Fully manual composition when the default markup does not fit -->
<template>
  <UICalendar v-model="date">
    <UICalendarHeader>
      <UICalendarPrevButton />
      <UICalendarHeading />
      <UICalendarNextButton />
    </UICalendarHeader>
    <UICalendarGrid>
      <UICalendarGridHead>
        <UICalendarGridRow>
          <UICalendarHeadCell>Su</UICalendarHeadCell>
        </UICalendarGridRow>
      </UICalendarGridHead>
      <UICalendarGridBody>
        <UICalendarGridRow>
          <UICalendarCell :date="date">
            <UICalendarCellTrigger :day="date" :month="date" />
          </UICalendarCell>
        </UICalendarGridRow>
      </UICalendarGridBody>
    </UICalendarGrid>
  </UICalendar>
</template>
```

```vue
<!-- Replacing the heading and the nav icons -->
<template>
  <UICalendar v-model="date" :default-placeholder="today(getLocalTimeZone())">
    <template #calendar-heading="{ date, month }">
      <component :is="month" :date="date" />
    </template>
    <template #calendar-prev-icon>
      <ChevronRight />
    </template>
    <template #calendar-next-icon>
      <ChevronLeft />
    </template>
  </UICalendar>
</template>
```

## References

- [Range Calendar](../range-calendar/AGENTS.md)
- [Popover](../popover/AGENTS.md)
- [Button](../button/AGENTS.md)
- [Native Select](../native-select/AGENTS.md)
- [shadcn-vue Calendar docs](https://shadcn-vue.com/docs/components/calendar)
- [reka-ui Calendar](https://reka-ui.com/docs/components/calendar)
- [@internationalized/date](https://react-spectrum.adobe.com/internationalized/date/index.html)
