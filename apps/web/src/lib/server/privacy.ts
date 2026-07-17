export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

const OMIT = Symbol('omit-identifier');

function scrub(value: JsonValue, identifier: string): JsonValue | typeof OMIT {
  if (value === identifier) return OMIT;
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const scrubbed = scrub(entry, identifier);
      return scrubbed === OMIT ? [] : [scrubbed];
    });
  }
  if (value && typeof value === 'object') {
    const scrubbed: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const next = scrub(entry, identifier);
      if (next !== OMIT) scrubbed[key] = next;
    }
    return scrubbed;
  }
  return value;
}

export function scrubJsonIdentifier(value: JsonValue, identifier: string): JsonValue {
  const scrubbed = scrub(value, identifier);
  return scrubbed === OMIT ? null : scrubbed;
}
