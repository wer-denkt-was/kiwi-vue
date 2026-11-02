import { apiErrorTransformer, ApiErrorTransformer } from '@/services/api-error-handler.service'
import { findErrorMessageKey } from '@/services/error-message-key'

interface ResolveTranslationMessage {
  // Messages may be compiled message functions instead of strings, depending on the i18n library configuration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (message: any, named?: Readonly<Record<string, unknown>>): string
}

interface ProvideTranslationMessage {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (key: string): undefined | null | Readonly<Record<string, any>>
}

interface ApiErrorI18nProvider {
  readonly tm: ProvideTranslationMessage
  readonly rt: ResolveTranslationMessage
  readonly messagesKey: string
}

/**
 * Create an {@link ApiErrorTransformer} compatible with i18n-libraries like
 * {@link https://vue-i18n.intlify.dev/ vue-i18n}.
 * Error messages are looked up by error message keys (see {@link ErrorMessageKey}) in the messages object
 * provided for `messagesKey`, and are resolved with the error details as named arguments.
 * @param tm Translation message provider: Accepts a translation-key, returns a translation-messages record
 * @param rt Translation resolver, accepts a translation-message and translation arguments, returns translated text
 * @param messagesKey Namespace key for error-messages
 * @see ApiErrorHandler
 */
export function i18nErrorTransformer({ tm, rt, messagesKey }: ApiErrorI18nProvider): ApiErrorTransformer {
  return apiErrorTransformer(error => {
    const errorMessages = tm(messagesKey)
    if (!errorMessages || typeof errorMessages !== 'object') return undefined

    const errorMessageKey = findErrorMessageKey(error, Object.keys(errorMessages))
    if (!errorMessageKey) return undefined

    return rt(errorMessages[errorMessageKey], error.details)
  })
}
