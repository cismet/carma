import { createElement, CSSProperties } from "react";
import type { Dispatch, Store } from "@reduxjs/toolkit";
import type { LatLng, Point } from "leaflet";
import proj4 from "proj4";

import CismapLayer from "react-cismap/CismapLayer";
import { proj4crs25832def } from "react-cismap/constants/gis";

import type { Layer } from "@carma-mapping/layers";

import {
  addNothingFoundID,
  addVectorInfo,
  clearFeatures,
  clearNothingFoundIDs,
  clearSecondaryInfoBoxElements,
  clearSelectedFeature,
  clearVectorInfos,
  getNothingFoundIDs,
  getPreferredLayerId,
  getVectorInfos,
  removeNothingFoundID,
  setFeatures,
  setInfoTextToNothingFound,
  setSecondaryInfoBoxElements,
  setSelectedFeature,
  setVectorInfo,
} from "../../store/slices/features";
import { getLayers } from "../../store/slices/mapping";

import {
  functionToFeature,
  getFeatureForLayer,
  objectToFeature,
} from "../feature-info/featureInfoHelper";
import { getAtLeastOneLayerIsQueryable, getQueryableLayers } from "./utils";
import { UIMode } from "../../store/slices/ui";
import { FeatureInfoIcon } from "../feature-info/FeatureInfoIcon";

interface WMTSLayerProps {
  type: "wmts";
  key: string;
  url: string;
  maxZoom: number;
  layers: string;
  format: string;
  opacity: string | number;
  tiled: boolean;
  transparent: string;
  pane: string;
}

interface VectorLayerProps {
  type: "vector";
  key: string;
  style: CSSProperties | string;
  maxZoom: number;
  pane: string;
  opacity: number | string;
  selectionEnabled?: boolean;
  maxSelectionCount?: number;
  onSelectionChanged?: (e: { hits: any[]; hit: any }) => void;
}

type Options = {
  dispatch: Dispatch;
  mode: UIMode;
  setPos: (pos: [number, number] | null) => void;
  store: Store;
  zoom: number;
};

// TODO: move to portal lib?

const MAX_ZOOM = 26;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const onClickTopicMap = async (
  e: {
    containerPoint: Point;
    latlng: LatLng;
    layerPoint: Point;
    originalEvent: PointerEvent;
    sourceTarget: HTMLElement;
    target: HTMLElement;
    type: string;
  },
  { dispatch, mode, setPos, store, zoom }: Options,
) => {
  const layers = getLayers(store.getState());
  const queryableLayers = getQueryableLayers(layers, zoom);
  if (
    mode === UIMode.FEATURE_INFO &&
    getAtLeastOneLayerIsQueryable(layers, zoom)
  ) {
    if (queryableLayers.find((layer) => layer.layerType === "vector")) {
      await wait(10);
    }

    const allVectorInfos = getVectorInfos(store.getState());
    const nothingFoundIDs = getNothingFoundIDs(store.getState());
    const preferredLayerId = getPreferredLayerId(store.getState());
    dispatch(clearSecondaryInfoBoxElements());
    dispatch(clearFeatures());
    const pos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      [e.latlng.lng, e.latlng.lat],
    );

    const vectorLayers = queryableLayers.filter(
      (layer) => layer.layerType === "vector",
    );

    if (vectorLayers.length === nothingFoundIDs.length) {
      dispatch(setVectorInfo(undefined));
    }

    const topLayer = queryableLayers[queryableLayers.length - 1];

    const vectorInfos = queryableLayers
      .map((layer) => {
        const vectorInfo = allVectorInfos.find((vi) => vi.id === layer.id);
        return vectorInfo;
      })
      .filter((vi) => vi !== undefined);

    const nothingFoundIDsWithoutInvisibleLayers = [...new Set(nothingFoundIDs)]
      .map((id) => {
        const foundLayer = layers.find((layer) => layer.id === id);
        if (foundLayer?.visible) {
          return id;
        } else {
          return undefined;
        }
      })
      .filter((id) => id !== undefined);

    if (
      topLayer.layerType !== "vector" ||
      vectorInfos[vectorInfos.length - 1]?.showMarker ||
      vectorInfos.length === 0 ||
      vectorLayers.length === nothingFoundIDsWithoutInvisibleLayers.length
    ) {
      setPos([e.latlng.lat, e.latlng.lng]);
    } else {
      setPos(null);
    }

    if (queryableLayers && pos[0] && pos[1]) {
      const result = await Promise.all(
        queryableLayers.map(async (testLayer) => {
          const vectorInfoIndex = vectorInfos.findIndex(
            (vi) => vi.id === testLayer.id,
          );
          const results = vectorInfos.filter((vi) => vi.id === testLayer.id);
          if (testLayer.layerType === "vector" && results.length === 0) {
            return undefined;
          } else if (testLayer.layerType === "vector" && results.length > 0) {
            return results;
          }

          const feature = await getFeatureForLayer(testLayer, pos, [
            e.latlng.lng,
            e.latlng.lat,
          ]);

          if (feature) {
            return feature;
          }
        }),
      );

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
      } else {
        if (preferredLayerId) {
          const preferredLayerIndex = filteredResult.findIndex(
            (feature) => feature.id === preferredLayerId,
          );

          if (preferredLayerIndex !== -1) {
            filteredResult.splice(
              0,
              0,
              ...filteredResult.splice(preferredLayerIndex, 1),
            );
          }
        }
        dispatch(setSelectedFeature(filteredResult[0]));
        dispatch(
          setSecondaryInfoBoxElements(
            filteredResult.slice(1, filteredResult.length),
          ),
        );
        dispatch(setFeatures(filteredResult));
        dispatch(clearVectorInfos());
      }
    }
  }
};

const checkIfLayerIsFirst = (layer: Layer, layers: Layer[]) => {
  const firstVectorLayerIndex = layers.findIndex(
    (l) => l.layerType === "vector",
  );
  return layers.findIndex((l) => l.id === layer.id) === firstVectorLayerIndex;
};

export const getCoordinates = (geometry) => {
  switch (geometry.type) {
    case "Polygon":
      return geometry.coordinates[0][0];
    case "LineString":
      return geometry.coordinates[1];
    default:
      return geometry.coordinates;
  }
};

const onSelectionChangedVector = (
  e: {
    hits: any[];
    hit: any;
  },
  { layer, layers, dispatch, setPos, zoom },
) => {
  if (e.hits && layer.queryable) {
    const selectedVectorFeature = e.hits[0];

    const coordinates = getCoordinates(selectedVectorFeature.geometry);

    const vectorPos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      coordinates,
    );

    const minimalBoxSize = 1;
    const featureInfoBaseUrl = layer.other.service.url;
    const layerName = layer.other.name;

    const imgUrl =
      featureInfoBaseUrl +
      `?&VERSION=1.1.1&REQUEST=GetFeatureInfo&BBOX=` +
      `${vectorPos[0] - minimalBoxSize},` +
      `${vectorPos[1] - minimalBoxSize},` +
      `${vectorPos[0] + minimalBoxSize},` +
      `${vectorPos[1] + minimalBoxSize}` +
      `&WIDTH=10&HEIGHT=10&SRS=EPSG:25832&FORMAT=image/png&TRANSPARENT=TRUE&BGCOLOR=0xF0F0F0&EXCEPTIONS=application/vnd.ogc.se_xml&FEATURE_COUNT=99&LAYERS=${layerName}&STYLES=default&QUERY_LAYERS=${layerName}&INFO_FORMAT=text/html&X=5&Y=5`;

    const properties = selectedVectorFeature.properties;
    let result = "";
    let featureInfoZoom = 20;
    layer.other.keywords.forEach((keyword) => {
      const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
      const zoom = keyword.split("carmaConf://featureInfoZoom:")[1];

      if (extracted) {
        result += extracted + "\n";
      }

      if (zoom) {
        featureInfoZoom = parseInt(zoom);
      }
    });

    if (result) {
      const featureProperties = result.includes("function")
        ? functionToFeature(properties, result)
        : objectToFeature(properties, result);
      const genericLinks = featureProperties.properties.genericLinks || [];

      const feature = {
        properties: {
          ...featureProperties.properties,
          genericLinks: genericLinks.concat([
            {
              url: imgUrl,
              tooltip: "Alte Sachdatenabfrage",
              icon: createElement(FeatureInfoIcon),
              target: "_legacyGetFeatureInfoHtml",
            },
          ]),
          zoom: featureInfoZoom,
        },
        geometry: selectedVectorFeature.geometry,
        id: layer.id,
        showMarker: selectedVectorFeature.geometry.type === "Polygon",
      };

      dispatch(addVectorInfo(feature));
      dispatch(removeNothingFoundID(layer.id));

      const queryableLayers = getQueryableLayers(layers, zoom);

      if (layer.id === queryableLayers[queryableLayers.length - 1]?.id) {
        setPos(null);
      }
    }
  } else {
    if (layer.queryable) {
      dispatch(addNothingFoundID(layer.id));
    }
  }
};

const createCismapLayer = (props: WMTSLayerProps | VectorLayerProps) => {
  return createElement(CismapLayer, props);
};

export const createCismapLayers = (
  layers: Layer[],
  {
    focusMode,
    mode,
    dispatch,
    setPos,
    zoom,
  }: {
    focusMode: boolean;
    mode: UIMode;
    dispatch: Dispatch;
    setPos: (pos: [number, number] | null) => void;
    zoom: number;
  },
) =>
  layers.map((layer, i) => {
    if (layer.visible) {
      switch (layer.layerType) {
        case "wmts":
          return createCismapLayer({
            key: `${i}_${layer.id}`,
            url: layer.props.url,
            maxZoom: MAX_ZOOM,
            layers: layer.props.name,
            format: "image/png",
            tiled: true,
            transparent: "true",
            pane: `additionalLayers${i + 1}`,
            opacity: layer.opacity.toFixed(1) || 0.7,
            type: "wmts",
          });
        case "vector":
          return createCismapLayer({
            key: `${i}_${layer.id}_${layer.opacity}`,
            style: layer.props.style,
            maxZoom: MAX_ZOOM,
            pane: `additionalLayers${i + 1}`,
            opacity: layer.opacity || 0.7,
            type: "vector",
            selectionEnabled:
              mode === UIMode.FEATURE_INFO && layer.useInFeatureInfo,
            onSelectionChanged: (e) =>
              onSelectionChangedVector(e, {
                layer,
                layers,
                dispatch,
                setPos,
                zoom,
              }),
          });
      }
    }
  });
