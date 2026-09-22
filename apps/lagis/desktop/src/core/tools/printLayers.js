/**
 * Maps the lagis LibreLayer stack onto the PrintInputLayer shape consumed by
 * @carma-mapping/print-core, whose getPrintLayers translates it into MapFish
 * layers: wms/wmts to WMS GetMap, vector to a tgl4printing style, inline to a
 * style POSTed to the tgl-wms renderer.
 */

import { buildFeatureCollectionPrintStyle } from "./libreFeatures";

/** @returns the print input layer, or null without a MapFish equivalent. */
const toInputLayer = (libreLayer) => {
  if (!libreLayer) {
    return null;
  }

  switch (libreLayer.type) {
    case "wms":
    case "wmts":
      if (!libreLayer.url || !libreLayer.layers) {
        return null;
      }
      return {
        visible: true,
        layerType: libreLayer.type,
        url: libreLayer.url,
        layers: libreLayer.layers,
        opacity: libreLayer.opacity ?? 1,
      };
    case "vector": {
      // Only hosted styles resolve to a tgl4printing style name.
      if (typeof libreLayer.style !== "string") {
        return null;
      }
      return {
        visible: true,
        layerType: "vector",
        style: libreLayer.style,
        props: { style: libreLayer.style },
        opacity: libreLayer.opacity ?? 1,
      };
    }
    default:
      return null;
  }
};

/**
 * Builds the printable layer stack in draw order (bottom to top): the rendered
 * background and additional layers, then the feature collection as an inline
 * geojson layer. getPrintLayers reverses it, so the foreground ends up on top.
 *
 * @param {object[]} libreLayers layers currently rendered on the map
 * @param {object} featureCollectionGeoJSON the foreground geometry
 * @returns {object[]} PrintInputLayer[]
 */
export const buildLagisPrintLayers = (
  libreLayers = [],
  featureCollectionGeoJSON
) => {
  const out = [];

  libreLayers.forEach((libreLayer) => {
    const mapped = toInputLayer(libreLayer);
    if (mapped) {
      out.push(mapped);
    }
  });

  const inlineStyle = buildFeatureCollectionPrintStyle(
    featureCollectionGeoJSON
  );
  if (inlineStyle) {
    out.push({
      visible: true,
      layerType: "inline",
      inlineStyle,
      opacity: 1,
    });
  }

  return out;
};
