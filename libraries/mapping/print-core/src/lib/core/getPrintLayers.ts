// Turn a normalized list of input layers into a MapFish layer stack.
//
// NOTE: the original geoportal helper combined background + overlay layers via
// the app-specific `convertLayerStringToLayers` config helper. That step is
// app-specific and stays in the app/engine; the core takes the already-combined,
// already-resolved list so it has no dependency on app config.

import {
  buildInlineStylePrint,
  buildTilesPrint,
  buildVectorStylePrint,
  buildWMSPrint,
  getStyleName,
} from "./buildLayers";
import type { MapFishLayer, PrintInputLayer } from "./types";

export function getPrintLayers(layers: PrintInputLayer[]): MapFishLayer[] {
  const layerPrint: MapFishLayer[] = [];

  layers.forEach((layer) => {
    if (!layer.visible) {
      return;
    }
    switch (layer.layerType) {
      case "wms":
      case "wmts":
      case "wmts-nt": {
        const url = layer.url || layer.props?.url;
        const name = layer.layers || layer.props?.name;
        if (!url || !name) {
          break;
        }
        layerPrint.unshift(buildWMSPrint(url, name, layer.opacity));
        break;
      }
      case "vector": {
        // Prefer the active printingStyle (kept in sync with the current
        // dynamic-styling option) over the plain vector style URL.
        const vectorStyle =
          layer.conf?.printingStyle || layer.style || layer.props?.style;
        const styleName = vectorStyle ? getStyleName(vectorStyle) : null;
        // Local (non-url) styles cannot be printed, so skip this layer.
        if (!styleName) {
          break;
        }
        layerPrint.unshift(buildVectorStylePrint(styleName, layer.opacity, 2, 1));
        break;
      }
      case "tiles": {
        if (layer.url) {
          layerPrint.unshift(buildTilesPrint(layer.url, layer.opacity));
        }
        break;
      }
      case "inline": {
        if (layer.inlineStyle) {
          layerPrint.unshift(
            buildInlineStylePrint(layer.inlineStyle, layer.opacity)
          );
        }
        break;
      }
    }
  });

  return layerPrint;
}
