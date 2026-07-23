/**
 * Builds a namespace: owns the adapter ref, exposes `register` to swap it, and
 * hands the caller a stateless facade constructed via the provided builder.
 *
 * Usage:
 *
 * ```ts
 * export const { facade: mapping, register: registerMapping } =
 *   createNamespace<MapAdapter, MappingFacade>((get) => ({
 *     getMode: () => get()?.getMode() ?? null,
 *     // ...
 *   }));
 * ```
 *
 * The facade identity is stable for the lifetime of the module; only the
 * internal adapter ref mutates when `register` is called.
 */
export function createNamespace<TAdapter, TFacade>(
  build: (getAdapter: () => TAdapter | null) => TFacade
): {
  facade: TFacade;
  register: (adapter: TAdapter | null) => void;
} {
  const ref: { current: TAdapter | null } = { current: null };
  return {
    facade: build(() => ref.current),
    register: (adapter) => {
      ref.current = adapter;
    },
  };
}
