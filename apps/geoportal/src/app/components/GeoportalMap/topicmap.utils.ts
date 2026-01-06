import { createElement } from "react";
import type { Dispatch, Store } from "@reduxjs/toolkit";
import type { LatLng, Map, Point } from "leaflet";
import proj4 from "proj4";

import {
  functionToFeature,
  objectToFeature,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma/types";

import {
  addCompletedVectorLayer,
  addNothingFoundID,
  addVectorInfo,
  clearCompletedVectorLayers,
  clearFeatures,
  clearNothingFoundIDs,
  clearSecondaryInfoBoxElements,
  clearSelectedFeature,
  clearVectorInfos,
  getCompletedVectorLayers,
  getNothingFoundIDs,
  getPreferredLayerId,
  getPreferredVectorLayerId,
  getVectorInfos,
  removeNothingFoundID,
  setFeatures,
  setInfoTextToNothingFound,
  setLoading,
  setPreferredVectorLayerId,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
  setVectorInfo,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";

import { getFeatureForLayer } from "../feature-info/featureInfoHelper";
import { getAtLeastOneLayerIsQueryable, getQueryableLayers } from "./utils";
import { UIMode } from "../../store/slices/ui";
import { FeatureInfoIcon } from "../feature-info/FeatureInfoIcon";
import { proj4crs3857def } from "../../helper/gisHelper";

type Options = {
  dispatch: Dispatch;
  mode: UIMode;
  store: Store;
  zoom: number;
  map: Map | maplibregl.Map;
};

// TODO: move to portal lib?

let currentAbortController: AbortController | null = null;

export const cancelOngoingRequests = () => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};

export const onClickTopicMap = async (
  e: {
    containerPoint?: Point;
    latlng: LatLng | maplibregl.LngLat;
    layerPoint?: Point;
    originalEvent?: PointerEvent;
    sourceTarget?: HTMLElement;
    target?: HTMLElement;
    type?: string;
  },
  { dispatch, mode, store, zoom, map }: Options
) => {
  const layers = getLayers(store.getState());
  const queryableLayers = getQueryableLayers(layers, zoom);
  if (
    mode === UIMode.FEATURE_INFO &&
    getAtLeastOneLayerIsQueryable(layers, zoom)
  ) {
    const completedVectorLayers = getCompletedVectorLayers(store.getState());
    const queryableVectorLayers = queryableLayers.filter(
      (layer) => layer.layerType === "vector"
    );

    // Check if all vector layers have completed loading their vector infos
    const allVectorLayersCompleted = queryableVectorLayers.every((layer) =>
      completedVectorLayers.includes(layer.id)
    );

    if (!allVectorLayersCompleted && queryableVectorLayers.length > 0) {
      await new Promise<void>((resolve) => {
        const checkCompletion = () => {
          const currentCompletedLayers = getCompletedVectorLayers(
            store.getState()
          );
          const allCompleted = queryableVectorLayers.every((layer) =>
            currentCompletedLayers.includes(layer.id)
          );

          if (allCompleted) {
            resolve();
          } else {
            setTimeout(checkCompletion, 10);
          }
        };

        checkCompletion();
      });
    }

    dispatch(clearCompletedVectorLayers());

    const allVectorInfos = getVectorInfos(store.getState());
    const nothingFoundIDs = getNothingFoundIDs(store.getState());
    const preferredLayerId = getPreferredLayerId(store.getState());
    const preferredVectorLayerId = getPreferredVectorLayerId(store.getState());
    const pos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs3857def,
      [e.latlng.lng, e.latlng.lat]
    );

    const vectorLayers = queryableLayers.filter(
      (layer) => layer.layerType === "vector"
    );

    if (vectorLayers.length === nothingFoundIDs.length) {
      dispatch(setVectorInfo(undefined));
    }

    if (queryableLayers && pos[0] && pos[1]) {
      dispatch(setLoading(true));
      cancelOngoingRequests();

      // Create new AbortController for this click
      currentAbortController = new AbortController();
      const signal = currentAbortController.signal;

      let abortedRequests = false;

      const result = await Promise.all(
        queryableLayers.map(async (testLayer) => {
          try {
            const results = allVectorInfos.filter(
              (vi) => vi.id === testLayer.id
            );
            if (testLayer.layerType === "vector" && results.length === 0) {
              return undefined;
            } else if (testLayer.layerType === "vector" && results.length > 0) {
              return results;
            }

            const features = await getFeatureForLayer(
              testLayer,
              pos,
              [e.latlng.lng, e.latlng.lat],
              map,
              signal
            );

            if (features) {
              return features;
            }
          } catch (error) {
            if (error.name === "AbortError") {
              abortedRequests = true;
              return undefined;
            }
            throw error;
          }
        })
      );

      dispatch(setLoading(false));

      if (abortedRequests) {
        return;
      }

      const filteredResult = result
        .filter((feature) => feature !== undefined)
        .reverse()
        .flat();

      dispatch(clearNothingFoundIDs());

      if (filteredResult.length === 0) {
        dispatch(clearSelectedFeature());
        dispatch(clearSecondaryInfoBoxElements());
        dispatch(clearFeatures());
        dispatch(setInfoTextToNothingFound());
        dispatch(clearVectorInfos());
        dispatch(
          setSelectedFeature({
            properties: {
              header: "Position",
              headerColor: "#0078a8",
              title: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
              subtitle: "(Geogr. Breite und Länge in Dezimalgrad, ETRS89)",
            },
            id: "information",
          })
        );
      } else {
        filteredResult.push({
          properties: {
            header: "Position",
            headerColor: "#0078a8",
            title: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
            subtitle: "(Geogr. Breite und Länge in Dezimalgrad, ETRS89)",
          },
          id: "information",
        });
        if (preferredVectorLayerId) {
          const preferredVectorLayerIndex = filteredResult.findIndex(
            (feature) => feature.vectorId === preferredVectorLayerId
          );
          if (preferredVectorLayerIndex !== -1) {
            filteredResult.splice(
              0,
              0,
              ...filteredResult.splice(preferredVectorLayerIndex, 1)
            );
          } else {
            dispatch(setPreferredVectorLayerId(undefined));
          }
        } else if (preferredLayerId) {
          const preferredLayerIndex = filteredResult.findIndex(
            (feature) => feature.id === preferredLayerId
          );

          if (preferredLayerIndex !== -1) {
            filteredResult.splice(
              0,
              0,
              ...filteredResult.splice(preferredLayerIndex, 1)
            );
          }
        }
        dispatch(setSelectedFeature(filteredResult[0]));
        dispatch(
          setSecondaryInfoBoxElements(
            filteredResult.slice(1, filteredResult.length)
          )
        );
        dispatch(setFeatures(filteredResult));
        dispatch(clearVectorInfos());
      }
    }
  } else if (
    mode === UIMode.FEATURE_INFO &&
    !getAtLeastOneLayerIsQueryable(layers, zoom)
  ) {
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(
      setSelectedFeature({
        properties: {
          header: "Position",
          headerColor: "#0078a8",
          title: `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
          subtitle: "(Geogr. Breite und Länge in Dezimalgrad, ETRS89)",
        },
        id: "information",
      })
    );
  }
};

/*
const checkIfLayerIsFirst = (layer: Layer, layers: Layer[]) => {
  const firstVectorLayerIndex = layers.findIndex(
    (l) => l.layerType === "vector"
  );
  return layers.findIndex((l) => l.id === layer.id) === firstVectorLayerIndex;
};
*/

export const getCoordinates = (geometry) => {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates[0][0];
    case "MultiPolygon":
      return geometry.coordinates[0][0][0];
    case "LineString":
      return geometry.coordinates[1];
    default:
      return geometry.coordinates;
  }
};

const createVectorFeature = async (
  coordinates,
  layer,
  selectedVectorFeature,
  map,
  latlng
) => {
  let feature = undefined;

  const pos = proj4(
    proj4.defs("EPSG:4326") as unknown as string,
    proj4crs3857def,
    [latlng.lng, latlng.lat]
  );

  const minimalBoxSize = 1;
  const featureInfoBaseUrl = layer.other?.service?.url;
  const layerName = layer.other.name;

  let viewportBbox = {
    left: pos[0] - minimalBoxSize,
    bottom: pos[1] - minimalBoxSize,
    right: pos[0] + minimalBoxSize,
    top: pos[1] + minimalBoxSize,
  };
  let viewportWidth = 10;
  let viewportHeight = 10;

  if (map) {
    if (
      "getBounds" in map &&
      typeof map.getBounds === "function" &&
      "getSize" in map &&
      typeof map.getSize === "function"
    ) {
      // Leaflet map
      const bounds = map.getBounds();
      const projectedNE = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [bounds.getNorthEast().lng, bounds.getNorthEast().lat]
      );
      const projectedSW = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [bounds.getSouthWest().lng, bounds.getSouthWest().lat]
      );

      viewportBbox = {
        left: projectedSW[0],
        bottom: projectedSW[1],
        right: projectedNE[0],
        top: projectedNE[1],
      };

      viewportWidth = map.getSize().x;
      viewportHeight = map.getSize().y;
    } else if ("getBounds" in map && typeof map.getBounds === "function") {
      // MapLibre map
      const bounds = map.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();

      const projectedNE = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [ne.lng, ne.lat]
      );
      const projectedSW = proj4(
        proj4.defs("EPSG:4326") as unknown as string,
        proj4crs3857def,
        [sw.lng, sw.lat]
      );

      viewportBbox = {
        left: projectedSW[0],
        bottom: projectedSW[1],
        right: projectedNE[0],
        top: projectedNE[1],
      };

      const container = map.getContainer();
      viewportWidth = container.clientWidth;
      viewportHeight = container.clientHeight;
    }
  }

  const pixelX = Math.round(
    ((pos[0] - viewportBbox.left) / (viewportBbox.right - viewportBbox.left)) *
      viewportWidth
  );
  const pixelY = Math.round(
    ((viewportBbox.top - pos[1]) / (viewportBbox.top - viewportBbox.bottom)) *
      viewportHeight
  );

  let legacyFeatureInfoUrl =
    featureInfoBaseUrl &&
    featureInfoBaseUrl +
      `?&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
      `${viewportBbox.left},` +
      `${viewportBbox.bottom},` +
      `${viewportBbox.right},` +
      `${viewportBbox.top}` +
      `&WIDTH=${viewportWidth}&HEIGHT=${viewportHeight}&SRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${layerName}&STYLES=default&QUERY_LAYERS=${layerName}&INFO_FORMAT=text/html&X=${pixelX}&Y=${pixelY}`;

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
      ? await functionToFeature(properties, result)
      : await objectToFeature(properties, result);
    if (!featureProperties) {
      return undefined;
    }
    const genericLinks = featureProperties?.properties?.genericLinks || [];

    feature = {
      properties: {
        ...featureProperties.properties,
        genericLinks:
          blockLegacyGetFeatureInfo || !legacyFeatureInfoUrl
            ? genericLinks
            : genericLinks.concat([
                {
                  url: legacyFeatureInfoUrl,
                  tooltip: "Vollständige Sachdatenabfrage",
                  icon: createElement(FeatureInfoIcon),
                  target: "_legacyGetFeatureInfoHtml",
                },
              ]),
        zoom: featureInfoZoom,
      },
      geometry: selectedVectorFeature.geometry,
      id: layer.id,
      vectorId: selectedVectorFeature.id,
      showMarker:
        selectedVectorFeature.geometry.type === "Polygon" ||
        selectedVectorFeature.geometry.type === "MultiPolygon",
    };
  }
  return feature;
};

export const implicitVectorSelection = async (
  e: {
    hits: any[];
    hit: any;
    latlng: LatLng;
  },
  { layer, dispatch, selectionHandler, featureHandler, leafletMap }
) => {
  selectionHandler(e, layer);
  if (!e.hits) {
  }

  if (e.hits && !layer.queryable) {
    const selectedVectorFeature = e.hits[0];

    if (selectedVectorFeature.setSelection) {
      selectedVectorFeature.setSelection(false);
    }

    if (!selectedVectorFeature.selectionLayerExists) {
      return;
    }

    //make sure to get a point from any geometry type
    const coordinates = getCoordinates(selectedVectorFeature.geometry);
    let headerColor = "#0078a8";
    if (layer.other?.accentColor) {
      headerColor = layer.other?.accentColor;
    }
    let header = layer.title || "Information";
    if (layer.other?.header) {
      header = layer.other?.header;
    }
    const feature = {
      properties: {
        _header: header,
        accentColor: headerColor,
        title: "Zu diesem Objekt sind keine weiteren Sachdaten verfügbar.",
        additionalInfo: `Position: ${coordinates[1].toFixed(
          5
        )}, ${coordinates[0].toFixed(5)}`,
        subtitle: "(Geogr. Breite und Länge in Dezimalgrad, ETRS89)",
        wmsProps: selectedVectorFeature.properties,
      },
      geometry: selectedVectorFeature.geometry,
      id: "information",
    };

    featureHandler(feature, layer);
  }

  if (e.hits && layer.queryable) {
    const selectedVectorFeature = e.hits[0];

    if (selectedVectorFeature.setSelection) {
      selectedVectorFeature.setSelection(false);
    }

    if (!selectedVectorFeature.selectionLayerExists) {
      return;
    }

    selectionHandler(e, layer);
    //make sure to get a point from any geometry type
    const coordinates = getCoordinates(selectedVectorFeature.geometry);

    const feature = await createVectorFeature(
      coordinates,
      layer,
      selectedVectorFeature,
      leafletMap,
      e.latlng
    );

    if (feature) {
      featureHandler(feature, layer);
      // dispatch(setSelectedFeature(feature));
    }
  }
};

export const onSelectionChangedVector = async (
  e: {
    hits: any[];
    hit: any;
    latlng: LatLng | maplibregl.LngLat;
  },
  { layer, dispatch, selectionHandler, map }
) => {
  selectionHandler(e, layer);
  if (!e.hits) {
  }

  if (e.hits && layer.queryable) {
    const uniqueHits = e.hits.filter(
      (hit, index) => e.hits.findIndex((h) => h.id === hit.id) === index
    );

    for (const vector of uniqueHits) {
      const coordinates = getCoordinates(vector.geometry);
      const feature = await createVectorFeature(
        coordinates,
        layer,
        vector,
        map,
        e.latlng
      );
      if (feature) {
        dispatch(addVectorInfo(feature));
        dispatch(removeNothingFoundID(layer.id));
      }
    }
  } else {
    if (layer.queryable) {
      dispatch(addNothingFoundID(layer.id));
    } else if (
      (layer.other.header || layer.other.headerColor) &&
      e.hit &&
      e.hit.selectionLayerExists
    ) {
      const selectedVectorFeature = e.hit;

      const coordinates = getCoordinates(selectedVectorFeature.geometry);
      let headerColor = "#0078a8";
      if (layer.other?.accentColor) {
        headerColor = layer.other?.accentColor;
      }
      let header = layer.title || "Information";
      if (layer.other?.header) {
        header = layer.other?.header;
      }
      const feature = {
        properties: {
          _header: header,
          accentColor: headerColor,
          title: "Zu diesem Objekt sind keine weiteren Sachdaten verfügbar.",
          additionalInfo: `Position: ${coordinates[1].toFixed(
            5
          )}, ${coordinates[0].toFixed(5)}`,
          subtitle: "(Geogr. Breite und Länge in Dezimalgrad, ETRS89)",
          wmsProps: selectedVectorFeature.properties,
        },
        geometry: selectedVectorFeature.geometry,
        id: layer.id,
      };

      dispatch(addVectorInfo(feature));
      dispatch(removeNothingFoundID(layer.id));
    }
  }
  dispatch(addCompletedVectorLayer(layer.id));
};
