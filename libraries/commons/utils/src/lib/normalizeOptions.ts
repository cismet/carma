export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined,
  defaults: Partial<T>
): Required<T>;
export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined,
  defaults: Required<T>
): Required<T>;
export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined = {},
  defaults: Required<T> | Partial<T>
): Required<T> | Partial<T> {
  const normalized = { ...defaults, ...options };
  return normalized;
}
