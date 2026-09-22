/** Translates the react-cismap layer configs into LibreLayers. */

/** Leaflet pane z-indices (RoutedMap.js), as a sort rank for MapLibre's
 *  array order. */
const PANE_RANK = {
  backgroundvectorLayers: 90,
  backgroundLayers: 100,
  oneAboveBackgroundLayers: 105,
  additionalLayers0: 250,
  additionalLayers1: 251,
  additionalLayers2: 252,
  additionalLayers3: 253,
};

const rankForPane = (pane, fallback) => PANE_RANK[pane] ?? fallback;

/**
 * @param {object} conf a single CismapLayer configuration
 * @param {number} opacity resolved opacity (opacityFunction already applied)
 * @param {number} defaultRank rank when the conf names no pane
 */
export const cismapConfToLibreLayer = (
  layerKey,
  conf,
  opacity,
  defaultRank
) => {
  if (!conf) {
    return undefined;
  }

  const rank = rankForPane(conf.pane, defaultRank);

  if (conf.type === "vector") {
    return {
      layer: {
        type: "vector",
        name: layerKey,
        carmaLayerId: layerKey,
        style: conf.style,
        opacity,
      },
      rank,
    };
  }

  if (conf.type === "wms" || conf.type === "wmts") {
    return {
      layer: {
        type: conf.type,
        carmaLayerId: layerKey,
        url: conf.url,
        layers: conf.layers,
        styles: conf.styles,
        version: conf.version,
        tileSize: conf.tileSize,
        maxZoom: conf.maxZoom,
        format: conf.format,
        transparent: conf.transparent,
        // react-cismap's `tiled: false` meant a single image request
        nonTiled: conf.tiled === false ? true : undefined,
        opacity,
      },
      rank,
    };
  }

  console.warn(`unsupported lagis layer type "${conf.type}" for ${layerKey}`);
  return undefined;
};

/** Orders entries by pane rank; stable, so one pane keeps its config order. */
export const sortLibreLayers = (entries) =>
  entries
    .filter(Boolean)
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.layer);
