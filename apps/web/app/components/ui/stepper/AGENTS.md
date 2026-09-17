# Stepper

Use this component family to show progress through an ordered or non-ordered multi-step flow with keyboard-accessible step triggers.

## Conclusion

Use `UIStepper` as the root, give every `UIStepperItem` a unique numeric `step`, and compose each item from a `UIStepperTrigger`, an indicator, and accessible title and description content. Add `UIStepperSeparator` between items. The root starts at step `1` and enforces linear navigation by default. Use `v-model` when the current numeric step belongs to the parent flow. The main gotcha is that `orientation="vertical"` changes navigation and data attributes but does not add the `flex-col` layout class.

## Usage

The Nuxt module auto-imports the components with the `UI` prefix. Use the exact tags below without component imports.

```vue
<script setup lang="ts">
const steps = [
  { step: 1, title: 'Your details', description: 'Provide your name and email' },
  { step: 2, title: 'Company details', description: 'Add your company information' },
  { step: 3, title: 'Invite your team', description: 'Start collaborating with your team' },
]
</script>

<template>
  <UIStepper class="flex w-full items-start gap-2">
    <UIStepperItem
      v-for="item in steps"
      :key="item.step"
      :step="item.step"
      class="relative flex w-full flex-col items-center"
    >
      <UIStepperTrigger>
        <UIStepperIndicator>{{ item.step }}</UIStepperIndicator>
      </UIStepperTrigger>
      <div class="mt-5 flex flex-col items-center text-center">
        <UIStepperTitle>{{ item.title }}</UIStepperTitle>
        <UIStepperDescription>{{ item.description }}</UIStepperDescription>
      </div>
      <UIStepperSeparator
        v-if="item.step !== steps[steps.length - 1]?.step"
        class="absolute left-[calc(50%+20px)] right-[calc(-50%+10px)] top-5 h-0.5 rounded-full bg-muted group-data-[state=completed]:bg-primary"
      />
    </UIStepperItem>
  </UIStepper>
</template>
```

## Meaningful Information

- **Imports.** `shadcn-nuxt` reads `apps/web/nuxt.config.ts`, which sets the component prefix to `UI` and the component directory to `@/components/ui`. Use the seven component tags documented here without importing them. Import lowercase helpers and type-only exports explicitly.
- **Exports.** `index.ts` exports `Stepper`, `StepperDescription`, `StepperIndicator`, `StepperItem`, `StepperSeparator`, `StepperTitle`, and `StepperTrigger`. Nuxt exposes these as `UIStepper`, `UIStepperDescription`, `UIStepperIndicator`, `UIStepperItem`, `UIStepperSeparator`, `UIStepperTitle`, and `UIStepperTrigger`.
- **Composition.** Put every `UIStepperItem` inside `UIStepper`. Give each item a unique numeric `step`. Put the interactive `UIStepperTrigger` and its `UIStepperIndicator` in the item. Put `UIStepperTitle` and `UIStepperDescription` next to the trigger when using their default elements. Put a `UIStepperSeparator` between adjacent items.
- **Root.** `UIStepper` wraps Reka UI `StepperRoot`, forwards its props and emits, and adds `flex gap-2`. Its main props are `defaultValue`, `modelValue`, `linear`, `orientation`, `dir`, `as`, `asChild`, and `class`. `defaultValue` is a number and defaults to `1`. `modelValue` is the controlled current step and has a numeric value. `linear` defaults to `true`. `orientation` accepts `horizontal` or `vertical` and defaults to `horizontal`. `dir` accepts `ltr` or `rtl`.
- **Current step.** The current value is one numeric item step, not the step object or an array. Use a data shape such as `{ step: 1, title: 'Your details', description: 'Provide your name and email' }`. The `title` and `description` fields belong to the application. Only the numeric `step` field is consumed by the stepper.
- **Uncontrolled state.** Use `default-value` when the stepper owns its state. The value is read on initial render, so later changes to `default-value` do not control the active step.
- **Controlled state.** Use `v-model` with a `ref<number>` when the parent owns the flow. The root emits `update:modelValue` with a numeric payload, and Vue maps that event to `v-model`.
- **Linear mode.** The default `linear` value requires steps to be completed in order. Set `:linear="false"` to allow direct activation of later steps. Linear mode does not replace form validation. Validate the current step before calling `nextStep`.
- **Item.** `UIStepperItem` wraps Reka UI `StepperItem` and adds `flex items-center gap-2 group`. Its required `step` prop is a unique number. `completed` defaults to `false` and marks the step complete. `disabled` defaults to `false` and prevents interaction. The wrapper adds `pointer-events-none` for disabled items.
- **Item state.** The item slot exposes `state` with one of `active`, `inactive`, or `completed`. The item and trigger expose the same value through `data-state`. Use `v-slot="{ state }"` when the indicator or trigger needs different content for each state.
- **Trigger.** `UIStepperTrigger` wraps Reka UI `StepperTrigger` and renders a button by default. It adds `p-1 flex flex-col items-center text-center gap-1 rounded-md`. Use `as-child` with one native button or another button-like component when the trigger needs a custom control.
- **Indicator.** `UIStepperIndicator` wraps Reka UI `StepperIndicator`, renders a span by default, and adds a circular `w-8 h-8` layout. Its slot exposes the current numeric `step`. The local styles use `data-state=active` for the primary color, `data-state=completed` for the accent color, and `data-disabled` for muted disabled text.
- **Title.** `UIStepperTitle` wraps Reka UI `StepperTitle`, renders an `h4` by default, and adds `text-md font-semibold whitespace-nowrap`. Keep the title meaningful because the primitive announces it when the trigger receives focus.
- **Description.** `UIStepperDescription` wraps Reka UI `StepperDescription`, renders a `div` by default, and adds `text-xs text-muted-foreground`. It is optional but becomes the trigger's accessible description when present.
- **Separator.** `UIStepperSeparator` wraps Reka UI `StepperSeparator` and adds a muted background. Its completed and disabled styles read the containing item's `data-state` and `data-disabled` attributes. The local wrapper does not decide separator geometry, so add horizontal or vertical positioning classes in the consuming layout.
- **Shared props.** Every local wrapper accepts the local `class` extension and merges it with its default classes through `cn`. The wrappers forward the corresponding Reka UI primitive props. Use `as` or `asChild` where the primitive supports it.
- **Root slot.** The default root slot exposes `modelValue: number | undefined`, `totalSteps: number`, `isNextDisabled: boolean`, `isPrevDisabled: boolean`, `isFirstStep: boolean`, `isLastStep: boolean`, `goToStep(step: number)`, `nextStep()`, `prevStep()`, `hasNext(): boolean`, and `hasPrev(): boolean`.
- **Indicator slot.** Use `v-slot="{ step }"` on `UIStepperIndicator` to render the primitive's current numeric step instead of hard-coding an indicator.
- **Events and methods.** Listen for `@update:model-value` when you need an explicit event handler. The root also exposes `goToStep`, `nextStep`, `prevStep`, `hasNext`, and `hasPrev` through its slot and component instance. The other local wrappers do not add custom emits.
- **Orientation.** Horizontal orientation uses left and right arrow navigation. Vertical orientation uses up and down arrow navigation. Add `flex-col` to the root and vertical separator geometry yourself. The root exposes `data-orientation` and `data-linear` for styling.
- **Data attributes.** Items and triggers expose `data-state`, `data-disabled`, and `data-orientation`. The root exposes `data-orientation` and adds `data-linear` when linear mode is active. Prefer these attributes for state styling instead of duplicating active state in unrelated refs.
- **Accessibility.** The default trigger is a button with built-in roving focus behavior. Tab moves focus to the first step. Arrow keys move focus according to `orientation`. Enter and Space select the focused step. Keep a `UIStepperTitle` for every trigger. Keep `UIStepperDescription` when it adds useful context. If a step has no description, pass `aria-describedby="undefined"` to `UIStepperTrigger` so the primitive does not reference a missing description.
- **Custom trigger markup.** `as-child` merges stepper behavior into its one child. Use a real button, preserve its accessible name, and do not add a second interactive element inside that child. If you put title or description content inside a custom button, set their `as` props to phrasing elements such as `span` because their defaults are `h4` and `div`.
- **Forms.** Keep step content outside the indicator and trigger markup. Use the root slot's navigation methods after the current step passes validation. The official form example uses `isNextDisabled`, `isPrevDisabled`, `nextStep`, `prevStep`, and `modelValue` for this flow.

## Examples

### Horizontal

Use the default orientation and position separators between the horizontally arranged items.

```vue
<script setup lang="ts">
const steps = [
  { step: 1, title: 'Your details', description: 'Provide your name and email' },
  { step: 2, title: 'Company details', description: 'Add your company information' },
  { step: 3, title: 'Invite your team', description: 'Start collaborating with your team' },
]
</script>

<template>
  <UIStepper class="flex w-full items-start gap-2">
    <UIStepperItem
      v-for="item in steps"
      :key="item.step"
      :step="item.step"
      class="relative flex w-full flex-col items-center"
    >
      <UIStepperTrigger>
        <UIStepperIndicator>{{ item.step }}</UIStepperIndicator>
      </UIStepperTrigger>
      <div class="mt-5 flex flex-col items-center text-center">
        <UIStepperTitle>{{ item.title }}</UIStepperTitle>
        <UIStepperDescription>{{ item.description }}</UIStepperDescription>
      </div>
      <UIStepperSeparator
        v-if="item.step !== steps[steps.length - 1]?.step"
        class="absolute left-[calc(50%+20px)] right-[calc(-50%+10px)] top-5 h-0.5 rounded-full bg-muted group-data-[state=completed]:bg-primary"
      />
    </UIStepperItem>
  </UIStepper>
</template>
```

### Vertical

Set `orientation="vertical"`, add `flex-col` to the root, and give each separator vertical geometry.

```vue
<script setup lang="ts">
const steps = [
  { step: 1, title: 'Your details', description: 'Provide your name and email address' },
  { step: 2, title: 'Company details', description: 'Add your company information' },
  { step: 3, title: 'Invite your team', description: 'Invite teammates or skip this step' },
]
</script>

<template>
  <UIStepper orientation="vertical" class="mx-auto flex w-full max-w-md flex-col gap-10">
    <UIStepperItem
      v-for="item in steps"
      :key="item.step"
      :step="item.step"
      class="relative flex w-full items-start gap-6"
    >
      <UIStepperTrigger>
        <UIStepperIndicator>{{ item.step }}</UIStepperIndicator>
      </UIStepperTrigger>
      <div class="flex flex-col gap-1">
        <UIStepperTitle>{{ item.title }}</UIStepperTitle>
        <UIStepperDescription>{{ item.description }}</UIStepperDescription>
      </div>
      <UIStepperSeparator
        v-if="item.step !== steps[steps.length - 1]?.step"
        class="absolute left-[18px] top-[38px] h-[105%] w-0.5 rounded-full bg-muted group-data-[state=completed]:bg-primary"
      />
    </UIStepperItem>
  </UIStepper>
</template>
```

### Controlled multi-step flow

Bind `v-model` when the parent also renders the content for the current step. The root slot supplies navigation methods and disabled flags for external controls.

```vue
<script setup lang="ts">
import { ref } from 'vue'

const currentStep = ref(1)
const steps = [
  { step: 1, title: 'Your details', description: 'Provide your name and email' },
  { step: 2, title: 'Company details', description: 'Add your company information' },
  { step: 3, title: 'Invite your team', description: 'Start collaborating with your team' },
]
</script>

<template>
  <UIStepper
    v-model="currentStep"
    v-slot="{ isNextDisabled, isPrevDisabled, nextStep, prevStep }"
    class="block w-full"
  >
    <div class="flex w-full items-start gap-2">
      <UIStepperItem
        v-for="item in steps"
        :key="item.step"
        :step="item.step"
        :completed="item.step < currentStep"
        class="relative flex w-full flex-col items-center"
      >
        <UIStepperTrigger>
          <UIStepperIndicator>{{ item.step }}</UIStepperIndicator>
        </UIStepperTrigger>
        <div class="mt-5 flex flex-col items-center text-center">
          <UIStepperTitle>{{ item.title }}</UIStepperTitle>
          <UIStepperDescription>{{ item.description }}</UIStepperDescription>
        </div>
        <UIStepperSeparator
          v-if="item.step !== steps[steps.length - 1]?.step"
          class="absolute left-[calc(50%+20px)] right-[calc(-50%+10px)] top-5 h-0.5 rounded-full bg-muted group-data-[state=completed]:bg-primary"
        />
      </UIStepperItem>
    </div>

    <section class="mt-6" aria-live="polite">
      <p v-if="currentStep === 1">Enter your contact details.</p>
      <p v-else-if="currentStep === 2">Add your company details.</p>
      <p v-else>Invite your teammates.</p>
    </section>

    <div class="mt-4 flex justify-between gap-2">
      <button type="button" :disabled="isPrevDisabled" @click="prevStep">Back</button>
      <button type="button" :disabled="isNextDisabled" @click="nextStep">Next</button>
    </div>
  </UIStepper>
</template>
```

## References

- [shadcn-vue Stepper documentation](https://shadcn-vue.com/docs/components/stepper)
- [Reka UI Stepper documentation](https://reka-ui.com/docs/components/stepper)
- [Local export barrel](./index.ts)
