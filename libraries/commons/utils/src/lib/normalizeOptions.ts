const removeUndefined = <T extends object>(obj: T): T => {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
};

export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined,
  defaults: Required<T>,
  allowUndefinedAsValue?: boolean
): Required<T>;
export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined,
  defaults: Partial<T>,
  allowUndefinedAsValue?: boolean
): Partial<T>;
export function normalizeOptions<T extends object>(
  options: Partial<T> | undefined = {},
  defaults: Required<T> | Partial<T>,
  allowUndefinedAsValue: boolean = false
): Required<T> | Partial<T> {
  const normalized = {
    ...defaults,
    ...(allowUndefinedAsValue ? options : removeUndefined(options)),
  };
  return normalized;
}
