/**
 * Translates the react-cismap layer configurations lagis has always used
 * (see components/commons/BackgroundLayers.jsx and AdditionalLayers.jsx)
 * into the LibreLayer shape expected by CarmaMap / LibreMap.
 *
 * The configs stay the single source of truth - only the rendering engine
 * changed.
 */

/**
 * Leaflet stacked the layers via named panes with fixed z-indices
 * (RoutedMap.js: backgroundvectorLayers 90, backgroundLayers 100,
 * additionalLayers<n> 250 + n). MapLibre draws in array order instead, so the
 * pane names are mapped to a sort rank that reproduces the same stacking.
 */
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
 * @param {string} layerKey key of the layer in its configuration object
 * @param {object} conf a single react-cismap CismapLayer configuration
 * @param {number} opacity resolved opacity (opacityFunction already applied)
 * @param {number} defaultRank stacking rank when the conf names no pane
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
        // react-cismap used `tiled: false` for single image WMS requests
        nonTiled: conf.tiled === false ? true : undefined,
        opacity,
      },
      rank,
    };
  }

  console.warn(`unsupported lagis layer type "${conf.type}" for ${layerKey}`);
  return undefined;
};

/**
 * Sorts entries produced by cismapConfToLibreLayer by their pane rank and
 * returns the plain LibreLayer array. The sort is stable, so layers sharing
 * a pane keep their configuration order.
 */
export const sortLibreLayers = (entries) =>
  entries
    .filter(Boolean)
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.layer);
