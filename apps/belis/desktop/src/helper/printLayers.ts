// Best-effort mapping of the BelIS MapLibre layer model onto the engine-
// agnostic PrintInputLayer shape consumed by @carma-mapping/print-core.
//
// The core's getPrintLayers then turns these into MapFish layers:
//   - wms / wmts  -> WMS GetMap against `url` with `layers`
//   - vector      -> tgl4printing WMS keyed by getStyleName(style)
//
// The Fachobjekt data layers (Leuchten, Standorte, …) are NOT printed via the
// on-screen styleY/brand.new styles: those draw white for the dark map and are
// invisible on the white page. Instead each *visible* category is printed via
// its own colored belis4print style, so the print mirrors the on-map filter
// toggles (category + Leitungstyp sub-type + regular/brandnew source).

import type { PrintInputLayer } from "@carma-mapping/print-core";
import type { LibreLayer } from "@carma-mapping/engines/maplibre";

import {
  additionalLayerConfigs,
  backgroundLayerConfigs,
  BELIS_PRINT_CATEGORY_BASENAMES,
  BELIS_PRINT_CATEGORY_ORDER,
  leitungstypSlug,
  printCategoryStyleUrl,
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
    case "vector": {
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
    }
    // geojson / cog layers have no MapFish equivalent here.
    default:
      return null;
  }
};

const expand = (entry: LibreLayer | LibreLayer[]): LibreLayer[] =>
  Array.isArray(entry) ? entry : [entry];

interface Leitungstyp {
  id: number;
  bezeichnung?: string;
}

/**
 * Resolve which Leitungen print-style basenames to use, mirroring the on-map
 * Leitungstyp filter (applyLeitungenFilter):
 *   - all types enabled (or none explicitly set) -> the combined "leitungen"
 *   - a subset enabled -> one "leitungen.<slug>" per enabled Leitungstyp
 *   - key table not loaded yet -> fall back to the combined style
 */
const resolveLeitungenBasenames = (
  enabledLeitungstypen: Record<number, boolean>,
  leitungstypen: Leitungstyp[]
): string[] => {
  if (!leitungstypen || leitungstypen.length === 0) return ["leitungen"];

  const noneExplicitlySet = Object.keys(enabledLeitungstypen).length === 0;
  const allEnabled = leitungstypen.every(
    (t) => enabledLeitungstypen[t.id] !== false
  );
  if (allEnabled || noneExplicitlySet) return ["leitungen"];

  return leitungstypen
    .filter((t) => enabledLeitungstypen[t.id] !== false && t.bezeichnung)
    .map((t) => `leitungen.${leitungstypSlug(t.bezeichnung as string)}`);
};

/**
 * Build the print-style basenames for every visible Fachobjekt category, in
 * bottom -> top draw order. A category contributes only when its filter toggle
 * is on (missing/true = on, matching the on-map behaviour).
 */
const buildVisibleCategoryBasenames = (params: {
  enabledCategoryFilters: Record<string, boolean>;
  enabledLeitungstypen: Record<number, boolean>;
  leitungstypen: Leitungstyp[];
}): string[] => {
  const { enabledCategoryFilters, enabledLeitungstypen, leitungstypen } =
    params;

  const out: string[] = [];
  for (const key of BELIS_PRINT_CATEGORY_ORDER) {
    if (enabledCategoryFilters[key] === false) continue;
    if (key === "leitungen") {
      out.push(...resolveLeitungenBasenames(enabledLeitungstypen, leitungstypen));
    } else {
      const basename = BELIS_PRINT_CATEGORY_BASENAMES[key];
      if (basename) out.push(basename);
    }
  }
  return out;
};

/**
 * Build the printable layer stack in draw order (bottom -> top):
 * active background, then active additional overlays, then the visible
 * Fachobjekt data layers (one colored belis4print style per visible category /
 * Leitungstyp / source). getPrintLayers reverses via unshift, so this order
 * yields the Fachobjekte on top of the overlays on top of the background.
 */
export const buildBelisPrintLayers = (params: {
  activeBackgroundLayer: string;
  backgroundLayerOpacities: Record<string, number>;
  activeAdditionalLayers: string[];
  additionalLayerOpacities: Record<string, number>;
  /** On-map category filter (missing/true = visible). */
  enabledCategoryFilters: Record<string, boolean>;
  /** On-map Leitungstyp sub-filter (id -> enabled, missing/true = visible). */
  enabledLeitungstypen: Record<number, boolean>;
  /** Leitungstyp key table (id -> bezeichnung) for sub-variant style lookup. */
  leitungstypen: Leitungstyp[];
  /** Source flavours visible on the map (default both on). */
  regularEnabled: boolean;
  brandnewEnabled: boolean;
}): PrintInputLayer[] => {
  const {
    activeBackgroundLayer,
    backgroundLayerOpacities,
    activeAdditionalLayers,
    additionalLayerOpacities,
    enabledCategoryFilters,
    enabledLeitungstypen,
    leitungstypen,
    regularEnabled,
    brandnewEnabled,
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

  // Visible Fachobjekt categories, one colored print style per category /
  // Leitungstyp. Regular sits below its brandnew counterpart so same-day edits
  // stay visible; both only when the corresponding source is shown on the map.
  const basenames = buildVisibleCategoryBasenames({
    enabledCategoryFilters,
    enabledLeitungstypen,
    leitungstypen,
  });
  const pushPrintStyle = (url: string) => {
    out.push({
      visible: true,
      layerType: "vector",
      style: url,
      props: { style: url },
      opacity: 1,
    });
  };
  for (const basename of basenames) {
    if (regularEnabled) pushPrintStyle(printCategoryStyleUrl(basename, false));
    if (brandnewEnabled) pushPrintStyle(printCategoryStyleUrl(basename, true));
  }

  return out;
};
