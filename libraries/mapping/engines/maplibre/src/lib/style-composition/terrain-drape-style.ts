import type { StyleSpecification } from "maplibre-gl";

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
