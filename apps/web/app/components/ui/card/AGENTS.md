# Card

Displays a grouped block of related content with an optional header, content, and footer.

## Conclusion

`UICard` is a plain flex column of styled `div`s, so compose it from `UICardHeader`, `UICardContent`, and `UICardFooter` and place them in that order. Every sub-part is optional and each is an independent slot wrapper, so `UICard` alone renders a valid bordered surface. The gotcha is that `UICardAction` is not a standalone part: it only positions correctly as a direct child of `UICardHeader`, where the header grid reserves column two for it.

## Usage

```vue
<template>
  <UICard>
    <UICardHeader>
      <UICardTitle>Card Title</UICardTitle>
      <UICardDescription>Card Description</UICardDescription>
    </UICardHeader>
    <UICardContent>
      <p>Card Content</p>
    </UICardContent>
    <UICardFooter>
      <p>Card Footer</p>
    </UICardFooter>
  </UICard>
</template>
```

## Meaningful Information

- The `shadcn-nuxt` module auto-imports components with the `UI` prefix, so use `<UICard>`, `<UICardHeader>`, `<UICardTitle>`, `<UICardDescription>`, `<UICardAction>`, `<UICardContent>`, `<UICardFooter>` with no import.
- Exports in `index.ts`: `Card`, `CardAction`, `CardContent`, `CardDescription`, `CardFooter`, `CardHeader`, `CardTitle`. There are no helper functions, variant maps, or type exports.
- Recommended child order: `UICardHeader` (containing `UICardTitle`, `UICardDescription`, `UICardAction`), then `UICardContent`, then `UICardFooter`.
- Props on `Card`: `size`, `class`. `size` values: `default`, `sm`. Default is `default`.
- Props on every sub-part: only `class`. Never fabricate a prop.
- `size="sm"` tightens gap, padding, and title size through the `data-size` attribute on `Card`; sub-parts read it via the `group/card` class, so set `size` on `UICard` only.
- `UICardAction` occupies the header's second grid column spanning both rows, aligned top right. `UICardHeader` switches to a two column grid only when a `card-action` slot is present.
- `UICardFooter` renders on a `bg-muted/50` surface with a top border. `UICard` removes its bottom padding when a `card-footer` slot is present, so the footer reaches the rounded corners.
- An `img` as the first child of `UICard` gets no top padding and rounded top corners; an `img` as the last child gets rounded bottom corners.
- No `v-model`, no events, no emitted values. The card is presentational; bind click handlers on the interactive children such as `UIButton`.
- Accessibility: the parts render `div` elements with no landmark roles and no heading semantics. Use `UICardTitle` for the visible title and add real heading markup or ARIA on the card root when a card must be reachable as a labelled region.
- The card root uses `overflow-hidden`, so child content that overflows is clipped rather than scrolled.

## Examples

```vue
<!-- Intent: minimal card with header and content -->
<template>
  <UICard>
    <UICardHeader>
      <UICardTitle>Card Title</UICardTitle>
      <UICardDescription>Card Description</UICardDescription>
    </UICardHeader>
    <UICardContent>
      <p>Card Content</p>
    </UICardContent>
  </UICard>
</template>
```

```vue
<!-- Intent: header action placed beside the title -->
<template>
  <UICard class="w-full max-w-sm">
    <UICardHeader>
      <UICardTitle>Login to your account</UICardTitle>
      <UICardDescription>Enter your email below to login to your account</UICardDescription>
      <UICardAction>
        <UIButton variant="link">Sign Up</UIButton>
      </UICardAction>
    </UICardHeader>
    <UICardContent>
      <form>
        <div class="grid w-full items-center gap-4">
          <div class="flex flex-col space-y-1.5">
            <UILabel for="email">Email</UILabel>
            <UIInput id="email" type="email" placeholder="m@example.com" />
          </div>
          <div class="flex flex-col space-y-1.5">
            <div class="flex items-center">
              <UILabel for="password">Password</UILabel>
              <a href="#" class="ml-auto inline-block text-sm underline">
                Forgot your password?
              </a>
            </div>
            <UIInput id="password" type="password" />
          </div>
        </div>
      </form>
    </UICardContent>
    <UICardFooter class="flex flex-col gap-2">
      <UIButton class="w-full">Login</UIButton>
      <UIButton variant="outline" class="w-full">Login with Google</UIButton>
    </UICardFooter>
  </UICard>
</template>
```

```vue
<!-- Intent: compact card with size sm -->
<template>
  <UICard size="sm">
    <UICardHeader>
      <UICardTitle>Compact</UICardTitle>
      <UICardDescription>Tighter padding and spacing</UICardDescription>
    </UICardHeader>
    <UICardContent>Body</UICardContent>
  </UICard>
</template>
```

## References

- [Card](https://shadcn-vue.com/docs/components/card)
- [Button](../button/AGENTS.md) for the actions in the header and footer
- [Input](../input/AGENTS.md) and [Label](../label/AGENTS.md) for the login form example
