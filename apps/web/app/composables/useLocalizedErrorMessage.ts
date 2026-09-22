import { localizeErrorMessage, type LocalizableError } from '@/utils/error-message'

export function useLocalizedErrorMessage(): (error: LocalizableError | undefined) => string {
  const { t } = useI18n()

  return (error) => (error === undefined ? '' : localizeErrorMessage(error, t))
}
