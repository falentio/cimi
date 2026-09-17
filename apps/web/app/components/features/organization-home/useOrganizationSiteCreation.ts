import { useMutation } from '@pinia/colada'
import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { CimiOrpc } from '~/plugins/orpc'
import { useOrpc } from '@/composables/useOrpc'
import type { WorkspaceSite } from '@/components/features/app-shell/workspace'
import { normalizeSettingsError } from '@/components/features/organization-settings/organization-settings.utils'
import type {
  OrganizationId,
  SettingsError,
} from '@/components/features/organization-settings/organization-settings.types'

export type OrganizationSiteCreationInput = Pick<
  Parameters<CimiOrpc['site']['createSite']['call']>[0],
  'name' | 'hostname'
>

export type OrganizationSiteCreationResult = Pick<WorkspaceSite, 'id'>

export function useOrganizationSiteCreation(options: {
  readonly organizationId: MaybeRefOrGetter<OrganizationId>
}) {
  const orpc = useOrpc()
  const mutation = useMutation(orpc.site.createSite.mutationOptions())
  const isCreating = mutation.isLoading
  const error = computed<SettingsError | undefined>(() => {
    const value = mutation.error.value
    return value === null
      ? undefined
      : normalizeSettingsError(value, 'Site creation failed. Try again.')
  })

  async function createSite(
    input: OrganizationSiteCreationInput,
  ): Promise<OrganizationSiteCreationResult> {
    mutation.reset()
    const site = await mutation.mutateAsync({
      organizationId: toValue(options.organizationId),
      name: input.name,
      hostname: input.hostname,
    })
    return { id: site.id }
  }

  return { isCreating, error, createSite }
}
