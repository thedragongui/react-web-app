export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
      (acc, [key, val]) => {
        const cleaned = stripUndefined(val);
        if (cleaned !== undefined) {
          acc[key] = cleaned;
        }
        return acc;
      },
      {},
    );
    return entries as T;
  }
  return value;
}
