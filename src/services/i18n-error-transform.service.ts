import { ApiErrorTransformer } from '@/services/api-error-handler.service.ts'
import { errorMessage } from '@/utils/error.ts'
import { ApiError } from '@/api'

interface ResolveTranslationMessage {
  (message: string, named?: Readonly<Record<string, unknown>>): string
}

interface ProvideTranslationMessage {
  (key: string): Readonly<Record<string, string>>
}

interface ApiErrorI18nProvider {
  readonly tm: ProvideTranslationMessage
  readonly rt: ResolveTranslationMessage
  readonly messagesKey: string
}

/**
 * Create an {@link ApiErrorTransformer} compatible with i18n-libraries like
 * {@link https://vue-i18n.intlify.dev/ vue-i18n}
 * @param tm Translation message provider: Accepts a translation-key, returns a translation-messages record
 * @param rt Translation resolver, accepts a translation-message and translation arguments, returns translated text
 * @param messagesKey Namespace key for error-messages
 * @see ApiErrorHandler
 */
export function i18nErrorTransformer({ tm, rt, messagesKey }: ApiErrorI18nProvider): ApiErrorTransformer {
  function formatApiErrorMessage(error: ApiError): undefined | string {
    const errorMessages = tm(messagesKey)
    if (!errorMessages) return undefined

    const errorMessageKey = determineErrorMessageKey(error, errorMessages)
    if (!errorMessageKey) return undefined

    const errorMessage = errorMessages[errorMessageKey]
    return rt(errorMessage, error.details)
  }

  function formatErrorMessage(error: unknown): undefined | string {
    if (error instanceof ApiError) return formatApiErrorMessage(error)
    else if (error instanceof Error) return error.message
    else return undefined
  }

  return error => {
    const rawMessage = errorMessage(error)
    const formattedMessage = formatErrorMessage(error) ?? rawMessage
    return { error, rawMessage, formattedMessage }
  }
}

interface ErrorMessageKey {
  readonly key: string
  readonly code: string
  readonly specificity: number
  test(details: Readonly<Record<string, unknown>>): boolean
}

const errorMessageKeyCache = new Map<string, ErrorMessageKey>()
const errorMessageKeyRegex = /^(?<code>.*?)\[(?<joinedConditions>.*?)]$/

class SimpleErrorMessageKey implements ErrorMessageKey {
  readonly code: string
  readonly specificity = -1

  constructor(readonly key: string) {
    this.code = key.toLowerCase()
  }

  test(): boolean {
    return true
  }
}

class MatchedErrorMessageKey implements ErrorMessageKey {
  readonly code: string

  constructor(
    readonly key: string,
    code: string,
    private readonly predicates: URLSearchParams,
  ) {
    this.code = code.toLowerCase()
  }

  get specificity(): number {
    return this.predicates.size
  }

  test(details: Readonly<Record<string, string>>): boolean {
    for (const [key, predicate] of this.predicates) {
      if (!(key in details)) {
        return false
      }
      if (predicate && predicate !== details[key]) {
        return false
      }
    }
    return true
  }
}

function parseErrorMessageKey(key: string): ErrorMessageKey {
  const cached = errorMessageKeyCache.get(key)
  if (cached) return cached

  const keyMatch = key.match(errorMessageKeyRegex)
  if (!keyMatch) return new SimpleErrorMessageKey(key)

  const { code = '', joinedConditions = '' } = keyMatch.groups ?? {}
  if (!code || !joinedConditions) return new SimpleErrorMessageKey(key)

  const predicates = new URLSearchParams(joinedConditions)
  return new MatchedErrorMessageKey(key, code.toLowerCase(), predicates)
}

function determineErrorMessageKey(error: ApiError, messages: Readonly<Record<string, string>>): string | undefined {
  let foundMessageKey: string | undefined
  let maxSpecificity = Number.NEGATIVE_INFINITY

  const errorCode = error.code.toLowerCase()
  const errorDetails: Record<string, string> = {}
  for (const [name, value] of Object.entries(error.details)) {
    errorDetails[name] = value ? String(value).trim().toLowerCase() : ''
  }

  for (const messageKey in messages) {
    const parsedMessageKey = parseErrorMessageKey(messageKey)
    if (
      parsedMessageKey.specificity > maxSpecificity &&
      parsedMessageKey.code === errorCode &&
      parsedMessageKey.test(errorDetails)
    ) {
      foundMessageKey = parsedMessageKey.key
      maxSpecificity = parsedMessageKey.specificity
    }
  }

  return foundMessageKey
}
