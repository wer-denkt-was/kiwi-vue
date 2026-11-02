import { apiErrorTransformer, ApiErrorTransformer } from '@/services/api-error-handler.service'
import { findErrorMessageKey, parseErrorMessageKey } from '@/services/error-message-key'

type JsonResource = Readonly<Record<string, unknown>>

/**
 * Create an {@link ApiErrorTransformer} that uses JSON resources to transform errors,
 * with {@link ApiError}s providing more details for the error message.
 * Keys of the resources are error message keys (see {@link ErrorMessageKey}), values are message templates with
 * `{{name}}` placeholders, which are replaced by the error detail `name`.
 * If multiple resources contain the same key, the last resource takes precedence.
 */
export function resourceErrorTransformer(...resources: ReadonlyArray<JsonResource>): ApiErrorTransformer {
  const messages = new Map<string, string>()
  resources.forEach(resource => {
    Object.entries(resource).forEach(([key, value]) => {
      if (!parseErrorMessageKey(key)) {
        console.warn('Invalid error key in resource:', key)
      } else {
        messages.set(key, String(value))
      }
    })
  })

  return apiErrorTransformer(error => {
    const key = findErrorMessageKey(error, messages.keys())
    if (!key) {
      const detailsJson = JSON.stringify(error.details)
      console.warn(`Missing error key for code "${error.code}" with details ${detailsJson}`)
      return undefined
    }
    return formatTemplate(messages.get(key) ?? '', error.details)
  })
}

const placeholderRegex = /\{\{\s*([^{}\s]+)\s*}}/g

function formatTemplate(template: string, details: Readonly<Record<string, unknown>>): string {
  // Replace all placeholders "{{<name>}}" (with optional whitespace like "{{ <name> }}") with detail values,
  // names are matched case-insensitively, and placeholders of absent details are kept as they are
  return template.replace(placeholderRegex, (placeholder, name: string) => {
    const lowerName = name.toLowerCase()
    const detail = Object.entries(details).find(([key]) => key.toLowerCase() === lowerName)
    if (!detail) return placeholder
    const [, value] = detail
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  })
}
