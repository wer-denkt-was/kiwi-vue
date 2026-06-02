import { errorMessage } from '@/utils/error'
import { ApiErrorTransformer } from './api-error-handler.service.ts'
import { ApiError } from '@/api'

type JsonResource = object & {}

/**
 * Create an {@link ApiErrorTransformer} that uses JSON resources to transform errors,
 * with {@link ApiError}s providing more details for the error message.
 */
export function resourceErrorTransformer(...resources: ReadonlyArray<JsonResource>): ApiErrorTransformer {
  const messageHandlerBundles = bundleHandlers(resources.flatMap(parseResource))

  // Format API errors using resources
  const formatErrorMessage = (error: unknown): string => {
    if (!(error instanceof ApiError)) {
      return errorMessage(error)
    }

    // Find available handlers for error code
    const { code, details } = error
    const codeHandlers = messageHandlerBundles.get(code)
    if (!codeHandlers) {
      console.warn(`Missing error key for code "${code}", available handlers:`, messageHandlerBundles)
      return error.message
    }

    // Find handler matching error details
    const handler = codeHandlers.find(x => x.matches(details))
    if (!handler) {
      const argsJson = JSON.stringify(details)
      console.warn(`No matching error key found for code "${code}" with ${argsJson}, available handlers:`, codeHandlers)
      return error.message
    }

    // User handler to format error message using details
    return handler.format(details)
  }

  return error => {
    const rawMessage = errorMessage(error)
    const formattedMessage = formatErrorMessage(error)
    return { error, rawMessage, formattedMessage }
  }
}

type Args = Record<string, unknown>
type MatchFn = (args: Args) => boolean
type FormatFn = (args: Args) => string

interface MessageHandler {
  readonly code: string
  readonly matches: MatchFn
  readonly format: FormatFn
  readonly specificity: number
}

function bundleHandlers(handlers: ReadonlyArray<MessageHandler>): Map<string, Array<MessageHandler>> {
  const result = new Map<string, Array<MessageHandler>>()
  handlers.forEach(handler => {
    const codeHandlers = result.get(handler.code)
    if (codeHandlers) {
      codeHandlers.push(handler)
    } else {
      result.set(handler.code, [handler])
    }
  })
  return result
}

function parseResource(resource: JsonResource): Array<MessageHandler> {
  // Parse keys/values in JSON as message handlers, and order them by descending specificity.
  // Most specific (i.e. more predicates) handlers are evaluated first, and least specific last.
  return Object.entries(resource)
    .map(([key, value]) => parseMessageHandler(key, value))
    .filter((x): x is MessageHandler => x !== false)
    .sort((a, b) => b.specificity - a.specificity)
}

// Key format: Either "code" or "code[where]"
const keyRegex = /^(?<code>.*?)(?:\[(?<condition>.*?)]?)?$/

const alwaysMatch: MatchFn = () => true

function parseMessageHandler(key: string, value: string): false | MessageHandler {
  const template = String(value)
  const format = createFormat(template)

  const keyMatch = key.match(keyRegex)
  if (!keyMatch) {
    console.warn('Invalid error key in resource:', key)
    return false
  }

  const { code = '', condition = '' } = keyMatch.groups ?? {}
  if (!code) {
    console.warn('Empty error key in resource')
    return false
  }

  if (!condition) {
    return { code, format, matches: alwaysMatch, specificity: -1 }
  }

  const [matches, specificity] = parseCondition(code, condition)
  return { code, format, matches, specificity }
}

function createFormat(template: string): FormatFn {
  // Replace all argument-name placeholders in template with argument values
  return args =>
    Object.entries(args).reduce((message, [name, value]) => {
      // Placeholder is "{{<name>}}", with optional whitespace within like "{{ <name> }}"
      const placeholder = new RegExp(`\\{\\{\\s*${name}\\s*}}`, 'ig')
      const replacement = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return message.replace(placeholder, replacement)
    }, template)
}

function parseCondition(code: string, condition: string): readonly [MatchFn, number] {
  // Condition format is "<key1>=<value1>,<key2>=<value2>,<...>"
  const predicates = condition
    .split(',')
    .map(x => x.split('=', 2))
    .map(x => {
      if (x.length !== 2) {
        console.warn(`Invalid condition for error key "${code}":`, x)
        return false
      }
      const name = x[0]?.trim() ?? ''
      const expectedValue = x[1]?.trim().toLowerCase() ?? ''
      return [name, expectedValue] as const
    })
    .filter((x): x is [string, string] => x !== false)

  const specificity = predicates.length
  const match: MatchFn = (args: Args) =>
    predicates.every(([name, expectedValue]) => {
      if (!(name in args)) {
        return true // Skip if value of argument is not specified ... ?
      }
      const actualValue = String(args[name]).trim().toLowerCase()
      return expectedValue === actualValue
    })

  return [match, specificity] as const
}
