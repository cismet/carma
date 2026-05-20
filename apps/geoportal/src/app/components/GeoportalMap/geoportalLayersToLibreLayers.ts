import type { StyleSpecification } from "maplibre-gl";

import type { Layer } from "@carma-mapping/layers";
import type { LibreLayer } from "@carma-mapping/core";

export const geoportalLayersToLibreLayers = (layers: Layer[]): LibreLayer[] => {
  const result: LibreLayer[] = [];

  for (const layer of layers) {
    if (!layer.visible) {
      continue;
    }
    if (!layer.props) {
      continue;
    }

    if (layer.layerType === "wmts" || layer.layerType === "wmts-nt") {
      const { url, name } = layer.props as { url?: string; name?: string };
      if (!url || !name) {
        continue;
      }
      result.push({
        type: "wmts",
        url,
        layers: name,
        transparent: true,
        opacity: layer.opacity ?? 1,
      });
    } else if (layer.layerType === "vector") {
      const { style } = layer.props as {
        style?: string | StyleSpecification;
      };
      if (!style) {
        continue;
      }
      result.push({
        type: "vector",
        name: layer.id,
        style,
        opacity: layer.opacity ?? 1,
      });
    }
  }

  return result;
};
