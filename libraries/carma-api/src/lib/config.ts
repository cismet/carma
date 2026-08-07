import { createNamespace } from "./create-namespace";

/**
 * A layer as a shared configuration carries it. Structural on purpose: this
 * package never imports `@carma-mapping/layers` (or any other @carma-* package),
 * so the shape is restated here in terms of what the apply path actually reads.
 * The index signature keeps a full stored configuration passable unchanged, with
 * everything the map does not need (`conf`, `other`, `layerInfo`, ...) along for
 * the ride.
 */
export type MappingConfigLayer = {
  /** stable across writes: it becomes the map's source name, and a changed id
   * tears the layer down and rebuilds it instead of updating it */
  id: string;
  title?: string;
  layerType?: string;
  visible?: boolean;
  opacity?: number;
  /**
   * Animate this layer's opacity changes, in milliseconds or as MapLibre's own
   * `{duration, delay}`. Left out, the map's default applies.
   *
   * This is what makes a fade one call instead of a dozen: hand the display a
   * configuration whose layer says how long its opacity takes to change, then
   * move the number once. There is no easing, only a duration and a delay.
   */
  opacityTransition?: number | { duration: number; delay?: number };
  props?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * The base map. `selectedLayerId` names an entry of the app's own base-map
 * table, which is where the title and the description texts come from, so a
 * configuration carries the choice and not the content.
 */
export type MappingConfigBackgroundLayer = {
  selectedLayerId: string;
  id?: string;
  visible?: boolean;
  opacity?: number;
  [key: string]: unknown;
};

/**
 * What `setMappingConfig` applies. This is the mapping part of a stored
 * configuration, and a whole stored configuration satisfies it: keys that are
 * not about the map (`view`, `gazetteerSelection`, `selectedFeature`) may be
 * present and are the app's business, not this call's.
 *
 * `backgroundLayer` is optional, so `{ layers: [...] }` is a valid document for
 * a display that wants layers over nothing.
 */
export type MappingConfig = {
  layers: MappingConfigLayer[];
  backgroundLayer?: MappingConfigBackgroundLayer;
  [key: string]: unknown;
};

/**
 * Raw injection point for the `config` namespace. The bridge provides these
 * closures. Optional methods may be left unimplemented; the facade no-ops.
 */
export interface ConfigAdapter {
  applyById?: (id: string) => Promise<boolean>;
  setMappingConfig?: (config: MappingConfig) => Promise<boolean>;
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
  /**
   * Apply a configuration that the caller already holds, without fetching one.
   * Same effect as `applyById` on a stored configuration with this content, and
   * the same call the id path ends in.
   *
   * For a caller that produces configurations itself, or that has one in hand
   * already, this avoids the round trip. It also accepts documents that were
   * never stored anywhere, which is the point: a display can be handed exactly
   * what it should show.
   */
  setMappingConfig: (config: MappingConfig) => Promise<boolean>;
  /**
   * The id whose content is currently applied, or null. A configuration applied
   * through `setMappingConfig` has no id, so this reports null after one: what
   * is on screen is then the caller's own to keep track of.
   */
  getAppliedId: () => string | null;
}

export const { facade: config, register: registerConfig } = createNamespace<
  ConfigAdapter,
  ConfigFacade
>((get) => ({
  applyById: (id) => get()?.applyById?.(id) ?? Promise.resolve(false),
  setMappingConfig: (mappingConfig) =>
    get()?.setMappingConfig?.(mappingConfig) ?? Promise.resolve(false),
  getAppliedId: () => get()?.getAppliedId?.() ?? null,
}));
