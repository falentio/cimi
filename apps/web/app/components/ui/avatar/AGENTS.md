# Avatar

Renders a user or entity image with a text fallback, plus optional badge and stacked-group composition.

## Conclusion

`UIAvatar` is the wrapper; `UIAvatarImage` and `UIAvatarFallback` are its children and `UIAvatarFallback` carries the initials shown while the image loads or on error. Reach for `UIAvatarBadge` to add a status dot and `UIAvatarGroup` to overlap several avatars, with `UIAvatarGroupCount` as the trailing overflow counter. The one gotcha: `UIAvatarImage` requires `src`, and the fallback renders during loading too, so supply `delayMs` on `UIAvatarFallback` to suppress a flash on fast connections.

## Usage

```vue
<template>
  <UIAvatar>
    <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
    <UIAvatarFallback>CN</UIAvatarFallback>
  </UIAvatar>
</template>
```

## Meaningful Information

- Exports: `Avatar`, `AvatarBadge`, `AvatarFallback`, `AvatarGroup`, `AvatarGroupCount`, `AvatarImage`, `avatarVariants`, `AvatarVariants` (type).
- Auto-imported tags (prefix `UI`, no import): `UIAvatar`, `UIAvatarImage`, `UIAvatarFallback`, `UIAvatarBadge`, `UIAvatarGroup`, `UIAvatarGroupCount`.
- `avatarVariants` and the `AvatarVariants` type need explicit import from `@/components/ui/avatar`.
- `UIAvatar` props: `class`, `size`. `size` enumeration: `sm`, `default`, `lg`; default `default`. Size is applied to the root and consumed by descendants via `data-size` and the `group/avatar` scope.
- `UIAvatarImage` props (from reka-ui `AvatarImage`): `src` (required, `string`), `alt`, `crossOrigin` (`"" | "anonymous" | "use-credentials"`), `referrerPolicy` (`"" | "no-referrer" | "no-referrer-when-downgrade" | "origin" | "origin-when-cross-origin" | "same-origin" | "strict-origin" | "strict-origin-when-cross-origin" | "unsafe-url"`), `as`, `asChild`, `class`. Event: `loadingStatusChange` with `ImageLoadingStatus`.
- `UIAvatarFallback` props (from reka-ui `AvatarFallback`): `delayMs` (`number`), `as`, `asChild`, `class`.
- `UIAvatarBadge` props: `class`. It is a `span` positioned bottom-right; it has no `size` prop and scales off the parent avatar size.
- `UIAvatarGroup` props: `class`. It horizontally overlaps children with negative space and applies a ring; set child sizes with `size` on each `UIAvatar`.
- `UIAvatarGroupCount` props: `class`. It sizes itself from the largest avatar in the group, so pass a matching size to the sibling avatars rather than overriding its own.
- Composition and order: `UIAvatar` wraps `UIAvatarImage` then `UIAvatarFallback` (image before fallback). `UIAvatarBadge` is a sibling inside `UIAvatar`. `UIAvatarGroup` wraps multiple `UIAvatar` plus a trailing `UIAvatarGroupCount`.
- Accessibility: always set `alt` on `UIAvatarImage` so the fallback and image share an accessible name; `UIAvatarFallback` is text and exposed to screen readers.
- No `v-model` on any part; the only event is `loadingStatusChange` on `UIAvatarImage`.

## Examples

<!-- Basic avatar with fallback -->

```vue
<template>
  <UIAvatar>
    <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
    <UIAvatarFallback>CN</UIAvatarFallback>
  </UIAvatar>
</template>
```

<!-- Sized avatar -->

```vue
<template>
  <UIAvatar size="lg">
    <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
    <UIAvatarFallback>CN</UIAvatarFallback>
  </UIAvatar>
</template>
```

<!-- Overlapping group with overflow count -->

```vue
<template>
  <UIAvatarGroup>
    <UIAvatar>
      <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
      <UIAvatarFallback>CN</UIAvatarFallback>
    </UIAvatar>
    <UIAvatar>
      <UIAvatarImage src="https://github.com/leerob.png" alt="@leerob" />
      <UIAvatarFallback>LR</UIAvatarFallback>
    </UIAvatar>
    <UIAvatarGroupCount>+3</UIAvatarGroupCount>
  </UIAvatarGroup>
</template>
```

<!-- Avatar with a status badge -->

```vue
<template>
  <UIAvatar>
    <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
    <UIAvatarFallback>CN</UIAvatarFallback>
    <UIAvatarBadge />
  </UIAvatar>
</template>
```

<!-- Delayed fallback to avoid a flash on fast connections -->

```vue
<template>
  <UIAvatar>
    <UIAvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
    <UIAvatarFallback :delay-ms="600">CN</UIAvatarFallback>
  </UIAvatar>
</template>
```

## References

- [shadcn-vue docs](https://shadcn-vue.com/docs/components/avatar)
- [reka-ui Avatar](https://reka-ui.com/docs/components/avatar.md)
