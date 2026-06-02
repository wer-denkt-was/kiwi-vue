/**
 * Algorithm for "decelerating" a JSON data structure that was accelerated by replacing redundant objects
 * with references.
 *
 * Example:
 * ```json
 * {
 *   "accelerated": true,
 *   "content": [ { "id": 1, "parent": {"@":1} } ],
 *   "references": [ {}, {}, {} ]
 * }
 * ```
 */

export interface Accelerated {
  content: unknown
  references: ReadonlyArray<unknown>
  accelerated: boolean
}

export function decelerate(accelerated: Accelerated): unknown {
  return accelerated.accelerated ? dereferenceValue(accelerated.content, accelerated.references) : accelerated.content
}

function dereferenceValue(value: unknown, references: ReadonlyArray<unknown>): unknown {
  // Replace and recursively process references
  const refIndex = refIndexFrom(value)
  if (refIndex !== false) {
    const referencedValue = references[refIndex]
    return dereferenceValue(referencedValue, references)
  }

  // Process arrays and objects, use other values as-is
  if (Array.isArray(value)) {
    return value.map(item => dereferenceValue(item, references))
  } else if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, dereferenceValue(item, references)] as const),
    )
  } else {
    return value
  }
}

function refIndexFrom(value: unknown): false | number {
  // Value must be an object
  if (typeof value !== 'object' || value === null) {
    return false
  }
  // Value must only have a single key: "@"
  if (!('@' in value) || Object.keys(value).length !== 1) {
    return false
  }
  // Index from "@" key must be numeric
  const index = value['@']
  if (typeof index !== 'number') {
    return false
  }
  // Value is a Ref
  return index
}
