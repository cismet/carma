import type { StyleSpecification } from "maplibre-gl";
import {
  isMapStyleContourLineLayer,
  isMapStyleElevationLabelLayer,
  isMapStyleRoadLabelLayer,
  isMapStyleRoadShieldLayer,
  type RuntimeStyleLayer,
} from "../runtime/integrations/map-style-layer-suppression";

/**
 * Terrain/LoD2 map style policy: preserve basemap colors and road shields;
 * tint light label halos with the current sun. Elevation details are opt-in.
 * Mesh uses the same elevation gates, but owns its separate paint policy.
 */
export const isTerrainMapStyleLayerHidden = (
  layer: RuntimeStyleLayer,
  showElevationLines = false,
  showElevationLabels = false
): boolean =>
  !layer.id.startsWith("carma-") &&
  ((!showElevationLines && isMapStyleContourLineLayer(layer)) ||
    (!showElevationLabels && isMapStyleElevationLabelLayer(layer)));

/** White and near-white halos (basemap.de uses rgb(255,253,238)) count as white. */
export const isWhiteLabelHalo = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const compact = value.toLowerCase().replace(/\s+/g, "");
  if (compact === "white") return true;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(compact);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1].split("").map((digit) => digit + digit)
        : [hex[1].slice(0, 2), hex[1].slice(2, 4), hex[1].slice(4, 6)];
    return digits.every((digit) => Number.parseInt(digit, 16) >= 235);
  }
  const rgb = /^rgba?\((\d+),(\d+),(\d+)(?:,[\d.]+)?\)$/.exec(compact);
  return (
    rgb !== null && rgb.slice(1, 4).every((channel) => Number(channel) >= 235)
  );
};

export const shouldTintTerrainLabelHalo = (
  layer: RuntimeStyleLayer,
  authoredHaloColor: unknown
): boolean =>
  !isMapStyleRoadShieldLayer(layer) &&
  authoredHaloColor != null &&
  (isMapStyleRoadLabelLayer(layer) || isWhiteLabelHalo(authoredHaloColor));

type StyleLayerIdentity = {
  id: string;
  type: string;
  source?: unknown;
  "source-layer"?: unknown;
};

/** Relief rasters are shading too, even when the style calls them `raster`. */
export const isTerrainShadingStyleLayer = (
  layer: StyleLayerIdentity
): boolean =>
  layer.type === "hillshade" ||
  layer.type === "color-relief" ||
  (layer.type === "raster" &&
    /(?:schummerung|hillshade|combshade|colordem|shaded[-_ ]?relief)/i.test(
      [layer.id, layer.source, layer["source-layer"]].join(":")
    ));

/** Prepare albedo before installation, not after its unused relief tiles load. */
export const prepareTerrainDrapeStyle = (
  style: StyleSpecification
): StyleSpecification => {
  const removedSources = new Set<string>();
  const layers = style.layers.filter((layer) => {
    if (!isTerrainShadingStyleLayer(layer)) return true;
    if ("source" in layer) removedSources.add(layer.source);
    return false;
  });
  const retainedSources = new Set(
    layers.flatMap((layer) => ("source" in layer ? [layer.source] : []))
  );
  if (style.terrain) retainedSources.add(style.terrain.source);
  return {
    ...style,
    sources: Object.fromEntries(
      Object.entries(style.sources).filter(
        ([id]) => !removedSources.has(id) || retainedSources.has(id)
      )
    ),
    layers,
  };
};

/** Flat albedo for terrain/LoD2; the shared Three lighting owns all shading. */
export const TERRAIN_MAP_STYLE = {
  baseColor: "#ffffff",
  opacity: 1,
  opaqueDrapeProperties: new Map<string, string>([
    ["background", "background-opacity"],
    ["fill", "fill-opacity"],
    ["raster", "raster-opacity"],
  ]),
} as const;
