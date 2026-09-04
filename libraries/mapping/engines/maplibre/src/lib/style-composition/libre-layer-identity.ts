import type { LibreLayer } from "../../components/LibreMap";
import { slugifyUrl } from "../../utils/styleComposer";

export const getLibreLayerCompositionKey = (
  layer: LibreLayer,
  index: number
): string => {
  switch (layer.type) {
    case "vector":
      return `vector::${layer.name}::${
        typeof layer.style === "string" ? layer.style : "inline"
      }`;
    case "geojson":
      return `geojson::${layer.name}::${layer.data}`;
    case "wms":
    case "wmts":
      return `${layer.type}::${layer.url}::${layer.layers}::${
        layer.nonTiled ? "nt" : "tiled"
      }`;
    case "tiles":
      return `tiles::${layer.name}::${layer.url}`;
    case "cog":
      return `cog::${layer.name}::${layer.url}`;
    default:
      return `unknown::${index}`;
  }
};

export const getLibreLayerSubStyleId = (
  layer: LibreLayer,
  index: number
): string => {
  switch (layer.type) {
    case "vector":
      return typeof layer.style === "string"
        ? slugifyUrl(layer.style)
        : layer.name;
    case "geojson":
      return `geojson-${layer.name}-${index}`;
    case "wms":
    case "wmts":
      return `raster-${layer.layers.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`;
    case "tiles":
      return `tiles-${layer.name.replace(/[^a-zA-Z0-9]/g, "-")}-${index}`;
    case "cog":
      return `cog-${layer.name}-${index}`;
    default:
      return `layer-${index}`;
  }
};
