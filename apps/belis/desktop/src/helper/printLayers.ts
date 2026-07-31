// Best-effort mapping of the BelIS MapLibre layer model onto the engine-
// agnostic PrintInputLayer shape consumed by @carma-mapping/print-core.
//
// The core's getPrintLayers then turns these into MapFish layers:
//   - wms / wmts  -> WMS GetMap against `url` with `layers`
//   - vector      -> tgl4printing WMS keyed by getStyleName(style)
//
// NOTE: the tgl4printing service must actually host a style matching
// getStyleName() for a vector layer to print (e.g. styleY.json -> "belis-styleY").
// Those endpoints are not verified here — this is the documented best-effort
// pass; layers the service does not know about simply come back blank.

import type { PrintInputLayer } from "@carma-mapping/print-core";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";

import {
  additionalLayerConfigs,
  backgroundLayerConfigs,
  leuchtenDataLayer,
} from "../config/mapLayerConfigs";

const toInputLayer = (
  layer: LibreLayer,
  fallbackOpacity: number
): PrintInputLayer | null => {
  switch (layer.type) {
    case "wms":
    case "wmts":
      return {
        visible: true,
        layerType: layer.type,
        url: layer.url,
        layers: layer.layers,
        opacity: layer.opacity ?? fallbackOpacity,
      };
    case "vector":
      // Inline StyleSpecification objects carry no style name/URL to derive
      // a tgl4printing style from; only string styles are printable.
      if (typeof layer.style !== "string") {
        return null;
      }
      return {
        visible: true,
        layerType: "vector",
        style: layer.style,
        props: { style: layer.style },
        opacity: layer.opacity ?? fallbackOpacity,
      };
    // geojson / cog layers have no MapFish equivalent here.
    default:
      return null;
  }
};

const expand = (entry: LibreLayer | LibreLayer[]): LibreLayer[] =>
  Array.isArray(entry) ? entry : [entry];

/**
 * Build the printable layer stack in draw order (bottom → top):
 * active background, then active additional overlays, then the always-on
 * Leuchten data layer on top. getPrintLayers reverses via unshift, so this
 * order yields the Leuchten on top of the overlays on top of the background.
 */
export const buildBelisPrintLayers = (params: {
  activeBackgroundLayer: string;
  backgroundLayerOpacities: Record<string, number>;
  activeAdditionalLayers: string[];
  additionalLayerOpacities: Record<string, number>;
}): PrintInputLayer[] => {
  const {
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
  } = params;

  const out: PrintInputLayer[] = [];

  const pushEntry = (
    entry: LibreLayer | LibreLayer[] | undefined,
    opacity: number
  ) => {
    if (!entry) return;
    for (const libreLayer of expand(entry)) {
      const mapped = toInputLayer(libreLayer, opacity);
      if (mapped) out.push(mapped);
    }
  };

  // Background (one active at a time).
  const bg = backgroundLayerConfigs[activeBackgroundLayer];
  pushEntry(bg?.layer, backgroundLayerOpacities[activeBackgroundLayer] ?? 1);

  // Additional overlays (any number active), in their activation order.
  for (const key of activeAdditionalLayers) {
    pushEntry(
      additionalLayerConfigs[key]?.layer,
      additionalLayerOpacities[key] ?? 1
    );
  }

  // Always-on Leuchten data layer (vector styleY) renders on top.
  pushEntry(leuchtenDataLayer, 1);

  return out;
};
