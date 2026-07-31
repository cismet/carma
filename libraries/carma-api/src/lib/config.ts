import { createNamespace } from "./create-namespace";

/**
 * Raw injection point for the `config` namespace. The bridge provides these
 * closures. Optional methods may be left unimplemented; the facade no-ops.
 */
export interface ConfigAdapter {
  applyById?: (id: string) => Promise<boolean>;
  getAppliedId?: () => string | null;
}

/** Public shape seen by callers of `carma.config`. */
export interface ConfigFacade {
  /**
   * Load a shared configuration by its id and apply its content, resolving to
   * whether that succeeded. Applying the id that is already applied is a no-op
   * that still resolves true, so callers may drive this idempotently.
   */
  applyById: (id: string) => Promise<boolean>;
  /** The id whose content is currently applied, or null. */
  getAppliedId: () => string | null;
}

export const { facade: config, register: registerConfig } = createNamespace<
  ConfigAdapter,
  ConfigFacade
>((get) => ({
  applyById: (id) => get()?.applyById?.(id) ?? Promise.resolve(false),
  getAppliedId: () => get()?.getAppliedId?.() ?? null,
}));
