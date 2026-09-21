import type { MappingConfig, MappingConfigLayer } from "@carma-api";

/**
 * Building the configuration a display is sent. A scene is the presenter's
 * base; the remote adds what belongs to the moment rather than to the scene:
 * opacity changes made on the phone, and the blackout.
 */

/**
 * The blackout is the plain black style over everything. The query string
 * keeps its id apart from a scene's own black layer (the pm-show "Tools"
 * group has the same style), while the file served stays the same.
 */
export const BLACKOUT_STYLE_URL =
  "https://tiles.cismet.de/colors/black.style.json?blackout";
export const BLACKOUT_LAYER_ID = `custom:${BLACKOUT_STYLE_URL}`;

export const isBlackoutLayer = (layer: MappingConfigLayer): boolean =>
  layer.id === BLACKOUT_LAYER_ID;

/**
 * Always on the display, transparent while the blackout is off. A layer that
 * is added fades in only if it already exists when its opacity changes, so
 * keeping it there makes switching the blackout a single write. Pinned last,
 * the block "always on top" layers are drawn in, and last in it.
 */
export const blackoutLayer = (
  on: boolean,
  fadeMs: number
): MappingConfigLayer => ({
  id: BLACKOUT_LAYER_ID,
  title: "Blackout",
  layerType: "vector",
  visible: true,
  opacity: on ? 1 : 0,
  opacityTransition: fadeMs,
  pinned: "last",
  props: { style: BLACKOUT_STYLE_URL },
});

export type BlackoutState = { on: boolean; fadeMs: number };

/** the scene's layers, then the blackout above everything */
export const composeDisplayConfig = (
  base: MappingConfig,
  blackout: BlackoutState
): MappingConfig => ({
  ...base,
  layers: [
    ...base.layers.filter((layer) => !isBlackoutLayer(layer)),
    blackoutLayer(blackout.on, blackout.fadeMs),
  ],
});

/** the blackout state a display configuration carries, if it carries one */
export const blackoutOf = (config: MappingConfig): boolean | undefined => {
  const layer = config.layers.find(isBlackoutLayer);
  return layer ? (layer.opacity ?? 1) > 0 : undefined;
};

/** a display configuration without the parts the remote adds */
export const baseOf = (config: MappingConfig): MappingConfig => ({
  ...config,
  layers: config.layers.filter((layer) => !isBlackoutLayer(layer)),
});

export const layerOpacity = (layer: MappingConfigLayer): number =>
  layer.opacity ?? 1;

export const withLayerOpacity = (
  base: MappingConfig,
  id: string,
  opacity: number,
  transitionMs: number
): MappingConfig => ({
  ...base,
  layers: base.layers.map((layer) =>
    layer.id === id
      ? { ...layer, opacity, opacityTransition: transitionMs }
      : layer
  ),
});

export const withLayerVisible = (
  base: MappingConfig,
  id: string,
  visible: boolean
): MappingConfig => ({
  ...base,
  layers: base.layers.map((layer) =>
    layer.id === id ? { ...layer, visible } : layer
  ),
});

/**
 * What to call a layer on a small screen. A share configuration usually has
 * the catalog title; a layer added by its style url often has none, and its
 * url minus the host and the `style.json` suffix is still readable.
 */
export const layerTitle = (layer: MappingConfigLayer): string => {
  if (typeof layer.title === "string" && layer.title.trim() !== "") {
    return layer.title;
  }
  const raw = layer.id.replace(/^custom:/, "");
  // a catalog id like "wuppKarten:R102:x" parses as a url with its own scheme
  if (!/^https?:\/\//.test(raw)) {
    return raw;
  }
  try {
    return new URL(raw).pathname
      .replace(/^\/+/, "")
      .replace(/\.?style\.json$/, "")
      .replace(/\/+$/, "");
  } catch {
    return raw;
  }
};
