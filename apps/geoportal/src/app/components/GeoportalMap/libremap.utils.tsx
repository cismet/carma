import maplibregl from "maplibre-gl";
import { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import slugify from "slugify";

import type { BackgroundLayer, Layer } from "@carma-commons/types";

import {
  functionToFeature,
  objectToFeature,
} from "../feature-info/featureInfoHelper";
import { defaultLayerConfig } from "../../config";
import { LibreGeoportalMapOptions } from "./LibreGeoportalMap";

const getPaintProperty = (layerStyle: LayerSpecification) => {
  const type = layerStyle.type;
  switch (type) {
    case "symbol":
      return layerStyle.id.includes("labels") ? "text-opacity" : "icon-opacity";
    case "raster":
      return "raster-opacity";
    case "line":
      return "line-opacity";
    case "fill":
      return "fill-opacity";
    default:
      return "icon-opacity";
  }
};

// proper relation would be log2 of tilesize / 256 but this is a fixed relation for maplibre and leaflet
// const zoomDelta = Math.log2(tilesize / 256);

export const zoom512as256 = (zoom512: number) => {
  return zoom512 + 1;
};

export const zoom256as512 = (zoom256: number) => {
  return zoom256 - 1;
};

export const getParamsMapLibre = (
  mapInstance: maplibregl.Map,
  defaultMapOptions: Required<LibreGeoportalMapOptions>
) => {
  const { lng, lat } = mapInstance.getCenter();
  const zoom512 = mapInstance.getZoom();
  const zoom = zoom512as256(zoom512);
  const pitch = mapInstance.getPitch();
  const bearing = mapInstance.getBearing();
  const params = {
    lng,
    lat,
    zoom,
    pitch,
    bearing,
  };

  // trigger removal of params if they are equal to the default values
  if (defaultMapOptions.bearing === bearing) {
    params.bearing = undefined;
  }
  if (defaultMapOptions.pitch === pitch) {
    params.pitch = undefined;
  }

  return params;
};

export const changeWmsVisibility = (
  map: maplibregl.Map,
  layers: Layer[],
  backgroundLayer: BackgroundLayer,
  visible: boolean
) => {
  map.style.stylesheet.layers.forEach((layer) => {
    if (layer.type === "raster") {
      const layerName = layer.id.replace("source-", "");
      const carmaLayer = layers.find((l) => layerName.startsWith(l.id));
      let showLayer = carmaLayer?.visible ?? backgroundLayer.visible;
      map.setLayoutProperty(
        layer.id,
        "visibility",
        visible && showLayer ? "visible" : "none"
      );
    }
  });
};

export const layersToMapLibreStyle = async (
  backgroundLayer: BackgroundLayer,
  layers: Layer[]
) => {
  const defaultSprite = "https://tiles.cismet.de/poi/sprites";
  const customSprites: maplibregl.SpriteSpecification = [];

  const style: StyleSpecification = {
    version: 8,
    sources: {
      terrainSource: {
        type: "raster-dem",
        tiles: [
          "https://wuppertal-terrain.cismet.de/services/wupp_dgm_01/tiles/{z}/{x}/{y}.png",
        ],
        tileSize: 512,
        maxzoom: 15,
      },
    },
    layers: [],
    glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
    sprite: defaultSprite,
  };

  if (backgroundLayer) {
    const namedLayers = defaultLayerConfig.namedLayers;
    const backgroundLayers = backgroundLayer.layers.split("|");
    if (backgroundLayer.layers.includes("basemap_relief")) {
      style.glyphs = "https://glyphs.cismet.de/fonts/{fontstack}/{range}.pbf";
    }
    for (const layer of backgroundLayers) {
      const layerName = layer.split("@")[0];
      const layerOptions = namedLayers[layerName];
      const opacity = layer.split("@")[1];
      const sourceId = `source-${layerName}`;

      if (layerOptions && layerOptions.type !== "vector") {
        const url =
          layerOptions.type === "tiles"
            ? layerOptions.url
            : `${layerOptions.url}?bbox={bbox-epsg-3857}&styles=&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=${layerOptions.layers}&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
        style.sources[sourceId] = {
          type: "raster",
          tiles: [url],
          tileSize: 256,
        };

        style.layers.push({
          id: `layer-${layerName}`,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": Number(opacity) / 100,
          },
          layout: {
            visibility: backgroundLayer.visible ? "visible" : "none",
          },
        });
      } else if (layerOptions && layerOptions.type === "vector") {
        const vectorStyle = layerOptions.style;

        if (vectorStyle) {
          const response = await fetch(vectorStyle);
          const additionalStyle = await response.json();
          // Process the regular layers
          let layers = additionalStyle.layers.map((layer) => {
            if (layer.type.includes("extrusion")) {
              // Create a duplicate layer for selections
              const selectionLayerId = `${layer.id}-selection`;

              // Add the original layer
              const originalLayer = {
                ...layer,
                metadata: {
                  ...layer.metadata,
                  "z-index": 100000,
                },
              };

              // Create a selection layer (will be empty initially)
              const selectionLayer = {
                ...layer,
                id: selectionLayerId,
                metadata: {
                  ...layer.metadata,
                  "z-index": 100001, // Higher z-index to appear on top
                  "selection-layer": true,
                },
                paint: {
                  ...layer.paint,
                  "fill-extrusion-color": "rgb(0,0,255)",
                  "fill-extrusion-opacity": 0.7,
                },
                filter: ["==", "__selected__", "true"], // This filter won't match any features initially
              };

              return [originalLayer, selectionLayer];
            } else {
              return layer;
            }
          });

          // Flatten the array since some items might be arrays now
          layers = layers.flat();

          style.sources = { ...style.sources, ...additionalStyle.sources };
          style.layers = [...style.layers, ...layers];
        }
      }
    }
  }

  const layerPromises = layers.map(async (layer, index) => {
    if (!layer.props) return;

    if (layer.layerType === "wmts" || layer.layerType === "wmts-nt") {
      const { url, name } = layer.props;
      if (!url || !name) return;

      const sourceId = `source-${name.replace(/[^a-zA-Z0-9]/g, "-")}`;

      style.sources[sourceId] = {
        type: "raster",
        tiles: [
          `${url}${
            url.endsWith("?") ? "" : "?"
          }bbox={bbox-epsg-3857}&styles=&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&width=256&height=256&layers=${name}&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`,
        ],
        tileSize: 256,
      };

      style.layers.push({
        id: `${layer.id}-${name.replace(/[^a-zA-Z0-9]/g, "-")}`,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": layer.opacity,
        },
        metadata: {
          "z-index": index,
          "layer-id": layer.id,
        },
        layout: {
          visibility: layer.visible ? "visible" : "none",
        },
      });
    } else if (layer.layerType === "vector") {
      const vectorStyle = layer.props.style;

      if (vectorStyle) {
        const response = await fetch(vectorStyle);
        const additionalStyle = await response.json();
        const layerId = layer.id;
        let spriteId = layerId.replace(":", "_");
        if (additionalStyle.sprite) {
          spriteId = slugify(additionalStyle.sprite, {
            remove: /[^a-zA-Z0-9]/g,
            lower: true,
          });

          const spriteExists = customSprites.some(
            (sprite) => sprite.id === spriteId
          );
          if (!spriteExists) {
            customSprites.push({
              id: spriteId,
              url: additionalStyle.sprite,
            });
          }
        }
        additionalStyle.layers = additionalStyle.layers.map((styleLayer) => ({
          ...styleLayer,
          id: `${layerId}-${styleLayer.id}`,
          metadata: {
            ...styleLayer.metadata,
            "z-index": index,
            "layer-id": layerId,
          },
          paint: {
            ...styleLayer.paint,
            ...(styleLayer.id.toLowerCase().includes("selection")
              ? {}
              : {
                  [getPaintProperty(styleLayer)]: layer.opacity,
                }),
          },
          layout: {
            ...styleLayer.layout,
            ...(styleLayer.layout?.["icon-image"] !== undefined
              ? {
                  "icon-image": [
                    "concat",
                    `${spriteId}:`,
                    styleLayer.layout?.["icon-image"],
                  ],
                }
              : {}),

            visibility: layer.visible ? "visible" : "none",
          },
        }));

        style.sources = { ...style.sources, ...additionalStyle.sources };
        style.layers = [...style.layers, ...additionalStyle.layers];
      }
    }
  });

  await Promise.all(layerPromises);

  style.layers.sort((a, b) => {
    const aZIndex = a.metadata?.["z-index"] || 0;
    const bZIndex = b.metadata?.["z-index"] || 0;
    return aZIndex - bZIndex; // Lower z-index values are rendered first
  });

  if (customSprites.length > 0) {
    style.sprite = customSprites;
  }

  return style;
};

export const createFeature = (selectedVectorFeature, layer) => {
  let feature = undefined;

  let properties = selectedVectorFeature.properties;
  properties = {
    ...properties,
    vectorId: selectedVectorFeature.id,
  };
  let result = "";
  let featureInfoZoom = 20;
  let blockLegacyGetFeatureInfo = false;
  layer.other.keywords.forEach((keyword) => {
    const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
    const zoom = keyword.split("carmaConf://featureInfoZoom:")[1];

    if (keyword.includes("blockLegacyGetFeatureInfo")) {
      blockLegacyGetFeatureInfo = true;
    }

    if (extracted) {
      result += extracted + "\n";
    }

    if (zoom) {
      featureInfoZoom = parseInt(zoom);
    }
  });

  if (result) {
    if (result.includes("function")) {
      // remove every line that is not a function
      result = result
        .split("\n")
        .filter((line) => line.includes("function"))
        .join("\n");
    }

    const featureProperties = result.includes("function")
      ? functionToFeature(properties, result)
      : objectToFeature(properties, result);
    if (!featureProperties) {
      return undefined;
    }
    const genericLinks = featureProperties.properties.genericLinks || [];

    feature = {
      properties: {
        ...featureProperties.properties,
        genericLinks: genericLinks,
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
      id: layer.id,
      showMarker:
        selectedVectorFeature.geometry.type === "Polygon" ||
        selectedVectorFeature.geometry.type === "MultiPolygon",
    };
  }
  return feature;
};

export const addMarkerToMap = (
  map: maplibregl.Map,
  latlng: { lat: number; lng: number }
) => {
  const crosshair = document.createElement("div");
  crosshair.className = "feature-info-marker";
  crosshair.innerHTML = `
    <div class="marker-inner">
      <div class="marker-circle"></div>
      <div class="marker-line horizontal-left"></div>
      <div class="marker-line horizontal-right"></div>
      <div class="marker-line vertical-top"></div>
      <div class="marker-line vertical-bottom"></div>
    </div>
  `;

  const marker = new maplibregl.Marker({
    element: crosshair,
    draggable: false,
  })
    .setLngLat([latlng.lng, latlng.lat])
    .addTo(map);

  return marker;
};
