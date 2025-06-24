const removeUndefined = <T extends object>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
};

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
  defaults: Required<T> | Partial<T>,
  {
    allowUndefined: allowUndefinedAsValue = false,
  }: { allowUndefined?: boolean } = {}
): Required<T> | Partial<T> {
  const normalized = {
    ...defaults,
    ...(allowUndefinedAsValue ? options : removeUndefined(options)),
  };
  return normalized;
}
