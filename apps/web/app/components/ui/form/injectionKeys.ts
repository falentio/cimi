import type { InjectionKey } from 'vue'

// SAFETY: symbol identity is the injection key; the string payload type is fixed by providers below.
export const FORM_ITEM_INJECTION_KEY = Symbol('FORM_ITEM_INJECTION_KEY') as InjectionKey<string>
