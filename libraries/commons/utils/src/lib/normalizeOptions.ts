export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined = {},
  defaults: Required<T>
): Required<T> {
  const normalized = { ...defaults, ...options };
  return normalized;
}
