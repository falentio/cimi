# Table

Displays tabular data with semantic native table elements, styled cells, and horizontal overflow for narrow viewports.

## Conclusion

Use `UITable` as the root and compose `UITableCaption`, `UITableHeader`, `UITableBody`, `UITableFooter`, `UITableRow`, `UITableHead`, and `UITableCell` inside it. Use `UITableEmpty` as a row inside `UITableBody` when no rows match. The component is presentational. It does not own data, sorting, filtering, pagination, selection, or other table state.

## Usage

The Nuxt module auto-imports these components with the `UI` prefix. Do not import the components in a template.

```vue
<template>
  <UITable>
    <UITableCaption>Recent invoices.</UITableCaption>
    <UITableHeader>
      <UITableRow>
        <UITableHead scope="col">Invoice</UITableHead>
        <UITableHead scope="col">Status</UITableHead>
        <UITableHead scope="col">Amount</UITableHead>
      </UITableRow>
    </UITableHeader>
    <UITableBody>
      <UITableRow>
        <UITableCell>INV001</UITableCell>
        <UITableCell>Paid</UITableCell>
        <UITableCell class="text-right">$250.00</UITableCell>
      </UITableRow>
    </UITableBody>
  </UITable>
</template>
```

## Meaningful Information

### Exports and auto-imports

- `index.ts` exports `Table`, `TableBody`, `TableCaption`, `TableCell`, `TableEmpty`, `TableFooter`, `TableHead`, `TableHeader`, and `TableRow`.
- `shadcn-nuxt` maps those PascalCase exports to `UITable`, `UITableBody`, `UITableCaption`, `UITableCell`, `UITableEmpty`, `UITableFooter`, `UITableHead`, `UITableHeader`, and `UITableRow`.
- Use all nine component tags without component imports in templates. Use the `UI` prefix for any other UI component used beside the table.
- The barrel exports no lowercase helper and no type-only export. Import any future lowercase helper or type-only export explicitly.
- The official Table page documents only Installation and Usage. It has no dedicated API, accessibility, empty-state, state, or event sections. This file records those details from the local source.

### Semantic composition

- `UITable` renders a `div` with horizontal overflow and a native `table` inside it.
- `UITableCaption` renders `caption` and belongs directly inside `UITable`.
- `UITableHeader` renders `thead` and contains `UITableRow` elements.
- `UITableBody` renders `tbody` and contains `UITableRow` elements.
- `UITableFooter` renders `tfoot` and contains `UITableRow` elements.
- `UITableRow` renders `tr` and contains `UITableHead` or `UITableCell` elements.
- `UITableHead` renders `th` for column or row headings.
- `UITableCell` renders `td` for data cells.
- `UITableEmpty` renders one `UITableRow` containing one `UITableCell` with a centered empty message. Put it directly inside `UITableBody`.
- Every component exposes its default slot. No component has named slots.

### Props and native attributes

- `UITable` accepts `class`. The prop is merged onto the inner `table`, after the defaults `w-full caption-bottom text-sm`.
- `UITableBody`, `UITableCaption`, `UITableCell`, `UITableFooter`, `UITableHead`, `UITableHeader`, and `UITableRow` each accept only `class`. Their default classes are merged with the supplied class.
- `UITableEmpty` accepts `class` and numeric `colspan`. Its `colspan` defaults to `1` and is applied to the inner `td`.
- Undeclared attributes fall through to the native root element for `UITableBody`, `UITableCaption`, `UITableCell`, `UITableFooter`, `UITableHead`, `UITableHeader`, and `UITableRow`.
- `UITableEmpty` forwards its declared `colspan` prop to its inner `UITableCell`. Other undeclared attributes fall through its root `UITableRow` and land on that `tr`.
- `UITable` is the exception. Its native root is the overflow `div`, so undeclared attributes land on that `div`, not on the inner `table`. Its declared `class` still styles the inner `table`.
- Pass native attributes such as `scope`, `headers`, `abbr`, `id`, `role`, `aria-*`, and `data-*` directly to the component that renders the target native element.
- Use native `colspan` or `rowspan` on `UITableCell` and `UITableHead` when a cell spans columns or rows. Vue maps these attributes to the native `colSpan` and `rowSpan` properties. Use numeric `:colspan` on `UITableEmpty` when the empty cell must cover the table width.

### Alignment and responsive overflow

- `UITable` wraps the table in `relative w-full overflow-x-auto`, so wide tables scroll horizontally instead of forcing the page wider.
- `UITableCell` uses `whitespace-nowrap` by default. Add a narrower width or an overriding whitespace class when a cell must wrap.
- `UITableHead` defaults to left alignment. Add `class="text-center"` or `class="text-right"` to a head or cell to align that column.
- The wrapper supplies responsive overflow. Add a minimum width to `UITable`, such as `class="min-w-[720px]"`, when columns need room to preserve their layout.
- The default styles add row borders, muted hover states, middle alignment, and a muted footer surface. Override them with the component `class` prop when the local table needs a different treatment.

### Empty state

- Use `UITableEmpty` only when the body has no rows to render.
- Set `:colspan` to the number of visible columns. The default value is `1`, so the empty cell does not span the table automatically.
- The component adds `p-4`, `text-sm`, `text-foreground`, and a centered container with vertical padding. Pass `class` to change the cell styling.
- `UITableEmpty` is a table row, not a replacement for `UITableBody`. Keep it inside `UITableBody` so the document keeps valid table structure.

### State, sorting, and filtering

- The table has no `v-model`, emitted component events, or internal state.
- The components do not sort, filter, paginate, select, expand, or fetch rows. Keep those operations in the page or a data-table wrapper.
- For sorting and filtering, follow the official Data Table guide and compose these components with TanStack Table. Register only the features the table needs, then render the resulting rows through the table components.
- Native DOM listeners still work through Vue attribute fallthrough on the native parts. A listener on `UITable` attaches to its overflow `div` because that is the component root.

### Accessibility and gotchas

- Give each data table a useful `UITableCaption`. It renders a native `caption` and describes the table to screen-reader users.
- Set `scope="col"` on column headers and `scope="row"` on row headers when the header relationship is not obvious from the table structure.
- The components do not add `scope`, `aria-sort`, accessible names, or interactive sorting controls. Add the attributes and controls that match the table's data model.
- Use a real button inside `UITableHead` for a sortable column. Update `aria-sort` on the header when the sort direction changes.
- Use `colspan` and `rowspan` on the cell or head that spans rows or columns. Do not put them on `UITableRow`.
- A caption is more reliable than passing `aria-label` to `UITable`, because `aria-label` falls through to the overflow `div` rather than the inner `table`.
- `UITableCell` is non-wrapping by default. Long values can create horizontal scrolling unless the cell class allows wrapping.
- `UITableEmpty` defaults to one column. A missing `:colspan` is the most common cause of a narrow empty-state cell.

## Examples

### Basic data

```vue
<script setup lang="ts">
const invoices = [
  { invoice: 'INV001', status: 'Paid', method: 'Credit Card', amount: '$250.00' },
  { invoice: 'INV002', status: 'Pending', method: 'PayPal', amount: '$150.00' },
]
</script>

<template>
  <UITable>
    <UITableCaption>A list of recent invoices.</UITableCaption>
    <UITableHeader>
      <UITableRow>
        <UITableHead scope="col">Invoice</UITableHead>
        <UITableHead scope="col">Status</UITableHead>
        <UITableHead scope="col">Method</UITableHead>
        <UITableHead scope="col" class="text-right">Amount</UITableHead>
      </UITableRow>
    </UITableHeader>
    <UITableBody>
      <UITableRow v-for="invoice in invoices" :key="invoice.invoice">
        <UITableCell class="font-medium">{{ invoice.invoice }}</UITableCell>
        <UITableCell>{{ invoice.status }}</UITableCell>
        <UITableCell>{{ invoice.method }}</UITableCell>
        <UITableCell class="text-right">{{ invoice.amount }}</UITableCell>
      </UITableRow>
    </UITableBody>
    <UITableFooter>
      <UITableRow>
        <UITableCell colspan="3">Total</UITableCell>
        <UITableCell class="text-right">$400.00</UITableCell>
      </UITableRow>
    </UITableFooter>
  </UITable>
</template>
```

### Caption

```vue
<template>
  <UITable>
    <UITableCaption>Monthly usage by workspace.</UITableCaption>
    <UITableHeader>
      <UITableRow>
        <UITableHead scope="col">Workspace</UITableHead>
        <UITableHead scope="col">Requests</UITableHead>
      </UITableRow>
    </UITableHeader>
    <UITableBody>
      <UITableRow>
        <UITableCell>Control</UITableCell>
        <UITableCell>12,480</UITableCell>
      </UITableRow>
    </UITableBody>
  </UITable>
</template>
```

### Empty

```vue
<script setup lang="ts">
const columns = ['Invoice', 'Status', 'Amount']
</script>

<template>
  <UITable>
    <UITableCaption>Invoices matching the current filters.</UITableCaption>
    <UITableHeader>
      <UITableRow>
        <UITableHead v-for="column in columns" :key="column" scope="col">
          {{ column }}
        </UITableHead>
      </UITableRow>
    </UITableHeader>
    <UITableBody>
      <UITableEmpty :colspan="columns.length">No invoices found.</UITableEmpty>
    </UITableBody>
  </UITable>
</template>
```

### Responsive table

```vue
<script setup lang="ts">
const services = [
  { name: 'API', region: 'us-east', status: 'Healthy', requests: '1.2M', latency: '42 ms' },
  { name: 'Worker', region: 'eu-west', status: 'Degraded', requests: '840K', latency: '118 ms' },
]
</script>

<template>
  <UITable class="min-w-[720px]">
    <UITableCaption>Service health across regions.</UITableCaption>
    <UITableHeader>
      <UITableRow>
        <UITableHead scope="col">Service</UITableHead>
        <UITableHead scope="col">Region</UITableHead>
        <UITableHead scope="col">Status</UITableHead>
        <UITableHead scope="col" class="text-right">Requests</UITableHead>
        <UITableHead scope="col" class="text-right">Latency</UITableHead>
      </UITableRow>
    </UITableHeader>
    <UITableBody>
      <UITableRow v-for="service in services" :key="service.name">
        <UITableCell>{{ service.name }}</UITableCell>
        <UITableCell>{{ service.region }}</UITableCell>
        <UITableCell>{{ service.status }}</UITableCell>
        <UITableCell class="text-right">{{ service.requests }}</UITableCell>
        <UITableCell class="text-right">{{ service.latency }}</UITableCell>
      </UITableRow>
    </UITableBody>
  </UITable>
</template>
```

## References

- [Table](https://shadcn-vue.com/docs/components/table) for the official installation and basic usage page.
- [Data Table](https://shadcn-vue.com/docs/components/data-table) for TanStack Table sorting, filtering, pagination, selection, and expansion.
