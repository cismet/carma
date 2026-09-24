/**
 * Maps the lagis LibreLayer stack onto the PrintInputLayer shape consumed by
 * @carma-mapping/print-core, whose getPrintLayers translates it into MapFish
 * layers: wms/wmts to WMS GetMap, vector to a tgl4printing style, inline to a
 * style POSTed to the tgl-wms renderer.
 */

import { buildFeatureCollectionPrintStyle } from "./libreFeatures";

/** The print servers cannot reach the city intranet. */
const isIntranetUrl = (url) =>
  typeof url === "string" && url.includes("wuppertal-intra");

/** @returns the rendered layers whose data only the intranet serves */
export const findIntranetLayers = (libreLayers = []) =>
  libreLayers.filter((libreLayer) => isIntranetUrl(libreLayer?.url));

/**
 * The layer's style as the map renders it right now (opacity baked into the
 * paint), limited to its own style layers and sources. The tiles stay remote,
 * the renderer fetches them itself.
 *
 * @returns the style, or null when the map does not render the layer
 */
const buildLiveVectorStyle = (map, carmaLayerId) => {
  const style = map?.getStyle?.();
  if (!style || !carmaLayerId) {
    return null;
  }

  const layers = (style.layers ?? []).filter(
    (layer) =>
      layer.type !== "background" &&
      layer.metadata?.["carma-layer-id"] === carmaLayerId
  );
  if (layers.length === 0) {
    return null;
  }

  const sources = {};
  layers.forEach((layer) => {
    if (layer.source && style.sources?.[layer.source]) {
      sources[layer.source] = style.sources[layer.source];
    }
  });

  return {
    version: 8,
    name: carmaLayerId,
    ...(style.sprite != null ? { sprite: style.sprite } : {}),
    ...(style.glyphs != null ? { glyphs: style.glyphs } : {}),
    sources,
    layers,
  };
};

/** @returns the print input layer, or null when it cannot be printed. */
const toInputLayer = (libreLayer, map) => {
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
      const inlineStyle = buildLiveVectorStyle(map, libreLayer.carmaLayerId);
      if (inlineStyle) {
        // opacity is already in the paint
        return {
          visible: true,
          layerType: "inline",
          inlineStyle,
          opacity: 1,
        };
      }
      // Without a map only hosted styles resolve to a tgl4printing style name.
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
 * @param {object} [map] the live MapLibre map, source of the vector styles
 * @returns {object[]} PrintInputLayer[]
 */
export const buildLagisPrintLayers = (
  libreLayers = [],
  featureCollectionGeoJSON,
  map
) => {
  const out = [];

  libreLayers.forEach((libreLayer) => {
    const mapped = toInputLayer(libreLayer, map);
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
