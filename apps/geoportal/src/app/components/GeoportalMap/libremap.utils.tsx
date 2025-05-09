import { BackgroundLayer } from "@carma-apps/portals";
import { type LayerSpecification, type StyleSpecification } from "maplibre-gl";
import { defaultLayerConfig } from "../../config";
import { Layer } from "@carma-mapping/layers";
import {
  functionToFeature,
  objectToFeature,
} from "../feature-info/featureInfoHelper";
import maplibregl from "maplibre-gl";

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

export const layersToMapLibreStyle = async (
  backgroundLayer: BackgroundLayer,
  layers: Layer[]
) => {
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
    sprite: "https://tiles.cismet.de/poi/sprites",
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
    if (!layer.props || !layer.visible) return;

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
      });
    } else if (layer.layerType === "vector") {
      const vectorStyle = layer.props.style;

      if (vectorStyle) {
        const response = await fetch(vectorStyle);
        const additionalStyle = await response.json();
        additionalStyle.layers = additionalStyle.layers.map((styleLayer) => ({
          ...styleLayer,
          id: `${layer.id}-${styleLayer.id}`,
          metadata: {
            ...styleLayer.metadata,
            "z-index": index,
            "layer-id": layer.id,
          },
          paint: {
            ...styleLayer.paint,
            ...(styleLayer.id.toLowerCase().includes("selection")
              ? {}
              : {
                  [getPaintProperty(styleLayer)]: layer.opacity,
                }),
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
  const el = document.createElement("div");
  // el.className = "feature-info-marker";
  el.innerHTML = `
    <div class="marker-inner">
      <div class="marker-circle"></div>
      <div class="marker-line horizontal-left"></div>
      <div class="marker-line horizontal-right"></div>
      <div class="marker-line vertical-top"></div>
      <div class="marker-line vertical-bottom"></div>
    </div>
  `;

  const test = document.createElement("div");
  test.className = "feature-info-marker";
  test.innerHTML = `
    <div class="feature-info-marker-inner">
    </div>
  `;

  const marker = new maplibregl.Marker({
    element: el,
    draggable: false,
  })
    .setLngLat([latlng.lng, latlng.lat])
    .addTo(map);

  // const testMarker = new maplibregl.Marker({
  //   element: test,
  //   draggable: false,
  // })
  //   .setLngLat([latlng.lng, latlng.lat])
  //   .addTo(map);

  return marker;
};
