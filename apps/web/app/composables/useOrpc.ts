import type { CimiOrpc } from '~/plugins/orpc'

export function useOrpc(): CimiOrpc {
  return useNuxtApp().$orpc
}
