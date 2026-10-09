import { useMutation } from '@pinia/colada'
import { computed, onScopeDispose, toValue, type MaybeRefOrGetter } from 'vue'
import { toast } from 'vue-sonner'
import type { CimiOrpc } from '~/plugins/orpc'
import { useOrpc } from '../../../composables/useOrpc'
import type { WorkspaceSite } from '@/components/features/app-shell/workspace'
import { normalizeSettingsError } from '../organization-settings/organization-settings.utils'
import type {
  OrganizationId,
  SettingsError,
} from '@/components/features/organization-settings/organization-settings.types'

export type OrganizationSiteCreationInput = Pick<
  Parameters<CimiOrpc['site']['createSite']['call']>[0],
  'name' | 'hostname'
>

export type OrganizationSiteCreationResult = Pick<WorkspaceSite, 'id'>

export const SITE_CREATED_MESSAGE = 'Site created.'

/**
 * The controller only ever drives one mutation, so the client contract is the
 * narrow slice it actually calls. A real ORPC client satisfies it structurally.
 */
export interface OrganizationSiteCreationClient {
  readonly site: {
    readonly createSite: Pick<CimiOrpc['site']['createSite'], 'mutationOptions'>
  }
}

export interface OrganizationSiteCreationOptions {
  readonly organizationId: MaybeRefOrGetter<OrganizationId>
  readonly client?: OrganizationSiteCreationClient | undefined
}

export function useOrganizationSiteCreation(options: OrganizationSiteCreationOptions) {
  const orpc: OrganizationSiteCreationClient = options.client ?? useOrpc()
  const mutation = useMutation(orpc.site.createSite.mutationOptions())
  const isCreating = mutation.isLoading
  let disposed = false

  const error = computed<SettingsError | undefined>(() => {
    const value = mutation.error.value

    return value === null
      ? undefined
      : normalizeSettingsError(value, 'Site creation failed. Try again.')
  })

  function announceSuccess(): void {
    toast.success(SITE_CREATED_MESSAGE)
  }

  async function createSite(
    input: OrganizationSiteCreationInput,
  ): Promise<OrganizationSiteCreationResult> {
    mutation.reset()

    const site = await mutation.mutateAsync({
      organizationId: toValue(options.organizationId),
      name: input.name,
      hostname: input.hostname,
    })

    if (!disposed) announceSuccess()

    return { id: site.id }
  }

  onScopeDispose(() => {
    disposed = true
  })

  return { isCreating, error, createSite }
}
