import { ApiError } from '@/api'

/**
 * Extract a simple message string from an error,
 * which should be an {@link Error}, a primitive value, or some JSON serializable object
 */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message
  } else if (error instanceof Error) {
    return error.message
  } else if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean') {
    return String(error)
  } else {
    return JSON.stringify(error)
  }
}
