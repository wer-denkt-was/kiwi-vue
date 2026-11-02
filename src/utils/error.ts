/**
 * Extract a simple message string from an error,
 * which should be an {@link Error}, a primitive value, or some JSON serializable object
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  } else if (typeof error === 'string' || typeof error === 'number' || typeof error === 'boolean') {
    return String(error)
  } else {
    // JSON.stringify returns undefined for undefined values and functions, and throws for circular structures
    try {
      return JSON.stringify(error) ?? String(error)
    } catch {
      return String(error)
    }
  }
}
