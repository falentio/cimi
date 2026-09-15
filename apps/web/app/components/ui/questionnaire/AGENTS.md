# Questionnaire

Provides a keyboard-accessible, form-backed multi-step questionnaire with single-choice, multiple-choice, freeform, and skippable questions.

## Conclusion

Use `<UIQuestionnaire>` as the form root and place one or more `<UIQuestionnaireItem>` components inside it. Give every item a unique `name`, then compose its title, choices, answer controls, and error message with the questionnaire parts. Nuxt auto-imports these components with the `UI` prefix, so template code does not import them. Pass `items` when the order, server-rendered state, conditional items, or stable choice shortcuts matter. Read submitted answers from `FormData` unless you need controlled answer state or external validation.

## Usage

The shadcn-nuxt module maps exports from this folder to `UI`-prefixed template names. Use these tags without component imports:

```text
<UIQuestionnaire>
  <UIQuestionnaireProgress />
  <UIQuestionnaireItem>
    <UIQuestionnaireTitle />
    <UIQuestionnaireDescription />
    <UIQuestionnaireChoices>
      <UIQuestionnaireChoice>
        <UIQuestionnaireChoiceDescription />
      </UIQuestionnaireChoice>
      <UIQuestionnaireInput />
    </UIQuestionnaireChoices>
    <UIQuestionnaireError />
  </UIQuestionnaireItem>
  <UIQuestionnaireActions>
    <UIQuestionnairePrevious />
    <UIQuestionnaireSkip />
    <UIQuestionnaireNext />
    <UIQuestionnaireSubmit />
  </UIQuestionnaireActions>
</UIQuestionnaire>
```

`UIQuestionnaire`, `UIQuestionnaireItem`, and `UIQuestionnaireChoices` form the required structure for an answer flow. Add at least one `<UIQuestionnaireChoice>` or `<UIQuestionnaireInput>` inside `UIQuestionnaireChoices`. Add `UIQuestionnaireTitle` so the item has an accessible question name. The progress, description, error, and action parts are optional, but `UIQuestionnaireError` is the built-in place for validation feedback.

Declare `items` when the questionnaire has known order or needs server rendering. Each definition name must match a rendered `UIQuestionnaireItem` name. `items` is also the source for stable choice shortcut assignment.

Use `default-item` for an uncontrolled initial item. Use `v-model:item` when host state must control the active item, such as returning to the first item rejected by a schema. The controlled host must accept each `update:item` value and update the bound state.

Handle `@submit` on the root. The root validates its items before emitting the event. Call `event.preventDefault()` in the handler when the host owns submission. Handle `@reset` when the host needs to observe a reset. Prevent that event to keep the current answers and item.

Use `import { injectQuestionnaireItemContext, injectQuestionnaireRootContext } from '@/components/ui/questionnaire'` only when a descendant extension needs one of the two lowercase context composables. Use `import type` for the exported questionnaire types. Do not import the `UI` components in a Nuxt template. Apply the `UI` prefix to other shadcn-vue component tags as well.

## Meaningful Information

`index.ts` exports these public components:

- `Questionnaire`
- `QuestionnaireActions`
- `QuestionnaireChoice`
- `QuestionnaireChoiceDescription`
- `QuestionnaireChoices`
- `QuestionnaireDescription`
- `QuestionnaireError`
- `QuestionnaireInput`
- `QuestionnaireItem`
- `QuestionnaireNext`
- `QuestionnairePrevious`
- `QuestionnaireProgress`
- `QuestionnaireSkip`
- `QuestionnaireSubmit`
- `QuestionnaireTitle`

The barrel also re-exports the lowercase composables `injectQuestionnaireItemContext` and `injectQuestionnaireRootContext`. It re-exports these types for explicit type-only imports:

| Export                          | Exact definition or fields                                                                                                                   |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `QuestionnaireItemStatus`       | `'unanswered' \| 'answered' \| 'skipped'`                                                                                                    |
| `QuestionnaireShortcutMode`     | `'letters' \| 'numbers'`                                                                                                                     |
| `QuestionnaireInputType`        | `'date' \| 'datetime-local' \| 'email' \| 'month' \| 'number' \| 'password' \| 'search' \| 'tel' \| 'text' \| 'time' \| 'url' \| 'week'`     |
| `QuestionnaireChoiceDefinition` | `value: string` and optional `disabled: boolean`                                                                                             |
| `QuestionnaireItemDefinition`   | `name: string`, optional readonly `choices: QuestionnaireChoiceDefinition[]`, optional `disabled: boolean`, and optional `required: boolean` |

`Questionnaire` renders a real `<form>` and provides the root context.

| Prop or event | Type and default                                     | Behavior                                                                                                                  |
| ------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `class`       | `HTMLAttributes['class']`                            | Adds classes to the form.                                                                                                 |
| `defaultItem` | `string`, no default                                 | Sets the first item for uncontrolled use. It is ignored when `item` is provided.                                          |
| `item`        | `string`, no default                                 | Controls the active item. Use `v-model:item`.                                                                             |
| `items`       | `readonly QuestionnaireItemDefinition[]`, no default | Declares logical item order, item metadata, conditional items, and choice order for shortcuts.                            |
| `noValidate`  | `boolean`, `true`                                    | Keeps native constraint validation disabled by default. Set it to `false` to validate answered controls with the browser. |
| `shortcuts`   | `QuestionnaireShortcutMode`, no default              | Assigns letter or number shortcuts to choices.                                                                            |
| `update:item` | `string`                                             | Fires when navigation selects another item.                                                                               |
| `submit`      | `Event`                                              | Fires after every enabled item validates. The handler can prevent the native submission.                                  |
| `reset`       | `Event`                                              | Fires before the questionnaire restores defaults. Prevent it to keep the current state.                                   |

The root slot exposes `current`, `total`, `first`, and `last`. `current` is one-based. When `items` is absent, the root uses enabled item registrations in rendered document order. When `items` is present, its enabled definitions are authoritative, even before the item components mount.

`QuestionnaireItem` renders an active question as a `<fieldset>`. Inactive items are `hidden` and `inert`, and remain mounted so controlled state and default state can persist.

| Prop or event   | Type and default          | Behavior                                                                                                     |
| --------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `name`          | `string`, required        | Names the item, selects it for navigation, and names its submitted answers.                                  |
| `required`      | `boolean`, `false`        | Requires an answer before the item can continue. An optional item still needs an answer or an explicit skip. |
| `multiple`      | `boolean`, `false`        | Renders choices as checkboxes and retains every selected answer. The default renders choices as radios.      |
| `disabled`      | `boolean`, `false`        | Excludes the item from navigation and validation without unmounting it.                                      |
| `invalid`       | `boolean`, `false`        | Marks the item invalid from host validation. The host must clear it after the answer changes.                |
| `class`         | `HTMLAttributes['class']` | Adds classes to the fieldset.                                                                                |
| `update:status` | `QuestionnaireItemStatus` | Reports `unanswered`, `answered`, or `skipped`.                                                              |

The item slot exposes `active`, `invalid`, and `status`. Keep an item definition's `disabled` state aligned with the matching `QuestionnaireItem` prop. Do the same for disabled choice definitions and rendered choices when shortcuts are enabled.

The remaining components have these contracts:

| Component                        | Props, slots, and behavior                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `QuestionnaireTitle`             | Renders a `legend` by default. Accepts `class`, `id`, `as`, and `asChild`. A non-`legend` child is registered with the item as its accessible label.                                                                                                                                                                                                                                       |
| `QuestionnaireDescription`       | Renders a `p` by default and registers its generated or supplied `id` through `aria-describedby`. Accepts `class`, `id`, `as`, and `asChild`.                                                                                                                                                                                                                                              |
| `QuestionnaireChoices`           | Renders a `div` by default. Accepts `class`, `as`, and `asChild`. Its slot exposes the active `shortcuts` mode.                                                                                                                                                                                                                                                                            |
| `QuestionnaireChoice`            | Renders a labelled native `radio` or `checkbox`. `value` is required. Accepts `checked`, `defaultChecked`, `disabled`, and `class`. `checked` is controlled with `v-model:checked`; `defaultChecked` participates in mount and reset defaults. Emits `update:checked` with a boolean and `change` with the native `Event`. Its slot exposes `checked`, `disabled`, `shortcut`, and `type`. |
| `QuestionnaireChoiceDescription` | Renders secondary choice text as a `span`. Accepts `class` and has a default slot.                                                                                                                                                                                                                                                                                                         |
| `QuestionnaireInput`             | Renders a native `input` with type `text` by default. Accepts `modelValue`, `defaultValue`, `type`, `disabled`, and `class`. `type` uses `QuestionnaireInputType`. Use `v-model` for controlled state. It emits `update:modelValue` with a string. All other attributes, including `aria-label`, `placeholder`, `min`, `max`, `pattern`, and `autocomplete`, pass to the native input.     |
| `QuestionnaireError`             | Renders a hidden `p` by default. Accepts `class`, `id`, `as`, and `asChild`. It becomes visible with `role="alert"` when the item is invalid. Its slot exposes `invalid`. Without slot content, it uses `Choose an answer to continue.` for required items and `Choose an answer or skip this question.` for optional items.                                                               |
| `QuestionnaireProgress`          | Renders a named live `progressbar` as a `div` by default. Accepts `class`, `as`, and `asChild`. Its slot exposes `current`, `total`, `first`, and `last`.                                                                                                                                                                                                                                  |
| `QuestionnaireActions`           | Renders a three-column `div` action row by default. Accepts `class`, `as`, and `asChild`. Place previous, skip, and next or submit parts inside it.                                                                                                                                                                                                                                        |
| `QuestionnairePrevious`          | Renders an outline button by default. It is visible after the first item and calls `goPrevious` on click.                                                                                                                                                                                                                                                                                  |
| `QuestionnaireSkip`              | Renders an outline button by default. It is visible only for an optional active item. It clears that item, marks it `skipped`, and moves forward or submits on the last item.                                                                                                                                                                                                              |
| `QuestionnaireNext`              | Renders a default-variant button by default. It is visible before the last item and calls `goNext`. It has the `Enter` shortcut when enabled. Invalid answers keep the item active and focus the first invalid control.                                                                                                                                                                    |
| `QuestionnaireSubmit`            | Renders a default-variant submit button by default. It is visible only on the last item and has the `Enter` shortcut when enabled. The root still validates every enabled item before emitting `submit`.                                                                                                                                                                                   |

`QuestionnairePrevious`, `QuestionnaireSkip`, `QuestionnaireNext`, and `QuestionnaireSubmit` accept `variant`, `size`, `disabled`, `class`, `as`, and `asChild`. Their defaults are `outline` for `Previous` and `Skip`, `default` for `Next` and `Submit`, `default` for `size`, and `button` for `as`. The `variant` and `size` values come from the local button component.

`QuestionnaireActions`, `QuestionnaireProgress`, `QuestionnaireTitle`, `QuestionnaireDescription`, `QuestionnaireChoices`, `QuestionnaireError`, and all four navigation buttons accept `as` and `asChild`. Use `as-child` when another component must supply the rendered element. A title rendered as a non-`legend` child needs an id so the fieldset can reference it. The title and description wrappers preserve a child component's rendered id.

Answers are native form controls. A single-choice item submits one value under its item name. A multiple-choice item submits one value per selected choice, so read it with `formData.getAll(name)`. A skipped item removes answer names from its controls, so it contributes no `FormData` entry. A `QuestionnaireInput` contributes an entry only while it has a non-empty value. Empty input values do not answer an item.

Use `v-model:checked` on `QuestionnaireChoice` when the host owns selection. Use `v-model` on `QuestionnaireInput` when the host owns text. Use `default-checked` and `default-value` when the questionnaire should restore those values after a native form reset. The root does not expose a single answer-model prop.

Keyboard behavior is handled by the root form:

| Key                          | Behavior                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `ArrowDown`                  | Moves to the next answer. Empty navigable text inputs can move. Non-empty text entry stays in the input.                  |
| `ArrowUp`                    | Moves to the previous answer under the same rule.                                                                         |
| `ArrowRight`                 | Moves to the next item when the active item is not `unanswered`. Text entry and radio targets keep their native behavior. |
| `ArrowLeft`                  | Moves to the previous item outside text entry and radio targets.                                                          |
| `Enter`                      | Confirms a filled focused answer. It advances or submits on the last item. An empty answer does not confirm.              |
| `Meta+Enter` or `Ctrl+Enter` | Confirms the active item from anywhere in the form. Repeated keydown events do not repeat the action.                     |
| `A` through `Z`              | Selects the matching choice when `shortcuts="letters"`. Letter matching is case-insensitive.                              |
| `1` through `9`              | Selects the matching choice when `shortcuts="numbers"`.                                                                   |

Shortcut assignment uses enabled choices from `items` in definition order. Letters provide `A` through `Z`. Numbers provide `1` through `9`. Without `items`, enabled rendered choices receive shortcuts in document order. Choices beyond the available keys have no shortcut. Text entry, modifier-key combinations, IME composition, and repeated shortcut events do not trigger selection.

Validation runs when the user advances, confirms, skips, or submits. An item is valid when it is disabled, intentionally skipped while optional, or answered without an external invalid flag. A required item cannot be skipped. An optional unanswered item is invalid until the user answers or skips it. `QuestionnaireError` stays hidden until the item is invalid.

The root focuses the first invalid item on submission. An invalid active item focuses a filled freeform input first, then the first enabled answer control. Set `invalid` from an external schema and render the schema message inside `QuestionnaireError`. Clear the external error from the relevant choice or input event before the user retries.

Set `no-validate="false"` when browser constraint validation must run for answered controls. The root then checks native validity and calls `reportValidity()` on the first invalid control. Attributes such as `required`, `pattern`, `min`, and `max` must be passed to the native `UIQuestionnaireInput` through its attributes. The questionnaire's own required-state validation remains active either way.

The accessibility structure is part of the implementation. `QuestionnaireItem` uses a `fieldset` and `QuestionnaireTitle` uses a `legend` by default. Descriptions and visible errors connect through `aria-describedby`. Invalid items expose `aria-invalid`. `QuestionnaireProgress` announces its one-based position with a named live `progressbar`. Inactive items are hidden and inert, so they stay out of the tab order and accessibility tree. Navigation parts render real buttons by default.

Keep these gotchas in mind:

- The `UI` prefix is required in Nuxt templates. Component imports from `@/components/ui/questionnaire` are not needed.
- The two lowercase context composables require explicit value imports. The five public types require explicit type-only imports.
- `items` is the authoritative logical list when supplied. Give it unique names and keep every enabled definition rendered.
- Mirror conditional `disabled` values in both `items` and `QuestionnaireItem`. A definition disabled only in one place can leave logical order and runtime registration out of sync.
- Declare `choices` in `items` when shortcuts must stay stable across render-order changes. Disabled choices do not receive shortcut keys.
- `QuestionnaireInput` is a single-line native `input`. Its freeform answer is omitted while empty, and its `v-model` emits strings even when `defaultValue` or `modelValue` accepts a number.
- `as-child` can replace semantic elements. Preserve an accessible title id when replacing the default `legend`.
- The default root adds `novalidate`. Set `no-validate="false"` for native browser constraints.
- `QuestionnaireSubmit` is hidden before the last item, while `QuestionnaireNext` is hidden on the last item. Hidden actions are also inert and removed from the tab order.

## Examples

Choice question with stable letter shortcuts and native `FormData` submission:

```vue
<script setup lang="ts">
const items = [
  {
    choices: [{ value: 'tests' }, { value: 'docs' }, { value: 'history' }],
    name: 'context',
    required: true,
  },
] as const

function handleSubmit(event: Event) {
  event.preventDefault()
  const formData = new FormData(event.target as HTMLFormElement)
  console.log(formData.get('context'))
}
</script>

<template>
  <UIQuestionnaire :items="items" shortcuts="letters" @submit="handleSubmit">
    <UIQuestionnaireProgress />
    <UIQuestionnaireItem name="context" required>
      <UIQuestionnaireTitle>What context should the agent inspect?</UIQuestionnaireTitle>
      <UIQuestionnaireDescription>Select one source.</UIQuestionnaireDescription>
      <UIQuestionnaireChoices>
        <UIQuestionnaireChoice value="tests">
          <span>Existing tests</span>
          <UIQuestionnaireChoiceDescription
            >Check current behavior.</UIQuestionnaireChoiceDescription
          >
        </UIQuestionnaireChoice>
        <UIQuestionnaireChoice value="docs">Architecture documentation</UIQuestionnaireChoice>
        <UIQuestionnaireChoice value="history">Recent commit history</UIQuestionnaireChoice>
      </UIQuestionnaireChoices>
      <UIQuestionnaireError />
    </UIQuestionnaireItem>
    <UIQuestionnaireActions>
      <UIQuestionnaireSubmit>Save context</UIQuestionnaireSubmit>
    </UIQuestionnaireActions>
  </UIQuestionnaire>
</template>
```

Text input question with controlled reactive state:

```vue
<script setup lang="ts">
import { ref } from 'vue'

const instruction = ref('')
const items = [{ name: 'instruction', required: true }] as const

function handleSubmit(event: Event) {
  event.preventDefault()
  const formData = new FormData(event.target as HTMLFormElement)
  console.log(formData.get('instruction'))
}
</script>

<template>
  <UIQuestionnaire :items="items" @submit="handleSubmit">
    <UIQuestionnaireItem name="instruction" required>
      <UIQuestionnaireTitle>What should the agent remember?</UIQuestionnaireTitle>
      <UIQuestionnaireDescription>Enter a short instruction.</UIQuestionnaireDescription>
      <UIQuestionnaireChoices>
        <UIQuestionnaireInput
          v-model="instruction"
          aria-label="Agent instruction"
          placeholder="Keep the public API stable"
          type="text"
        />
      </UIQuestionnaireChoices>
      <UIQuestionnaireError />
    </UIQuestionnaireItem>
    <UIQuestionnaireActions>
      <UIQuestionnaireSubmit>Save instruction</UIQuestionnaireSubmit>
    </UIQuestionnaireActions>
  </UIQuestionnaire>
</template>
```

## References

- [Local `index.ts`](./index.ts)
- [Local `useQuestionnaire.ts`](./useQuestionnaire.ts)
- [Local questionnaire components](.)
- [Button](../button/AGENTS.md) for the `variant` and `size` values used by navigation parts
- [shadcn-vue Questionnaire documentation](https://shadcn-vue.com/docs/components/questionnaire)
- [shadcn-vue documentation index](https://www.shadcn-vue.com/llms.txt)
