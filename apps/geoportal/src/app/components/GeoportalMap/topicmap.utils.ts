import { createElement, CSSProperties } from "react";
import type { Dispatch, Store } from "@reduxjs/toolkit";
import type { LatLng, Point } from "leaflet";
import proj4 from "proj4";

import CismapLayer from "react-cismap/CismapLayer";
import { proj4crs25832def } from "react-cismap/constants/gis";

import type { Layer } from "@carma-mapping/layers";

import {
  addNothingFoundID,
  clearNothingFoundIDs,
  getNothingFoundIDs,
  getPreferredLayerId,
  getVectorInfo,
  removeNothingFoundID,
  setFeatures,
  setInfoText,
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
  onSelectionChanged?: (e: { hits: any[]; hit: any }) => void;
}

type Options = {
  dispatch: Dispatch;
  mode: UIMode;
  setPos: (pos: [number, number] | null) => void;
  store: Store;
};

// TODO: move to portal lib?

const MAX_ZOOM = 26;

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
  { dispatch, mode, setPos, store }: Options,
) => {
  const layers = getLayers(store.getState());
  const queryableLayers = getQueryableLayers(layers);
  if (mode === UIMode.FEATURE_INFO && getAtLeastOneLayerIsQueryable(layers)) {
    if (queryableLayers.find((layer) => layer.layerType === "vector")) {
      setTimeout(() => {}, 100);
    }

    const vectorInfo = getVectorInfo(store.getState());
    const nothingFoundIDs = getNothingFoundIDs(store.getState());
    const preferredLayerId = getPreferredLayerId(store.getState());
    dispatch(setSecondaryInfoBoxElements([]));
    dispatch(setFeatures([]));
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

    if (
      queryableLayers[queryableLayers.length - 1].layerType !== "vector" ||
      !vectorInfo ||
      vectorLayers.length === nothingFoundIDs.length
    ) {
      setPos([e.latlng.lat, e.latlng.lng]);
    } else {
      setPos(null);
    }

    if (queryableLayers && pos[0] && pos[1]) {
      const result = await Promise.all(
        queryableLayers.map(async (testLayer) => {
          if (
            testLayer.layerType === "vector" &&
            (testLayer.id !== vectorInfo?.id ||
              nothingFoundIDs.includes(testLayer.id))
          ) {
            return undefined;
          } else if (
            testLayer.layerType === "vector" &&
            testLayer.id === vectorInfo.id
          ) {
            return vectorInfo;
          }

          const feature = await getFeatureForLayer(testLayer, pos);

          if (feature) {
            return feature;
          }
        }),
      );

      const filteredResult = result
        .filter((feature) => feature !== undefined)
        .reverse();

      dispatch(clearNothingFoundIDs());

      if (filteredResult.length === 0) {
        dispatch(setSelectedFeature(null));
        dispatch(setSecondaryInfoBoxElements([]));
        dispatch(setFeatures([]));
        dispatch(setInfoText("Keine Informationen an dieser Stelle gefunden."));
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
      }
    }
  }
};

const onSelectionChangedVector = (
  e: {
    hits: any[];
    hit: any;
  },
  { layer, layers, dispatch, setPos },
) => {
  if (e.hits && layer.queryable) {
    const selectedVectorFeature = e.hits[0];
    const vectorPos = proj4(
      proj4.defs("EPSG:4326") as unknown as string,
      proj4crs25832def,
      selectedVectorFeature.geometry.coordinates,
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
    layer.other.keywords.forEach((keyword) => {
      const extracted = keyword.split("carmaconf://infoBoxMapping:")[1];
      if (extracted) {
        result += extracted + "\n";
      }
    });

    if (result) {
      const featureProperties = result.includes("function")
        ? functionToFeature(properties, result)
        : objectToFeature(properties, result);

      const feature = {
        properties: {
          ...featureProperties.properties,
          genericLinks: [
            {
              url: imgUrl,
              tooltip: "Alte Sachdatenabfrage",
              iconname: "lupe",
            },
          ],
        },
        id: layer.id,
      };

      dispatch(setVectorInfo(feature));
      dispatch(removeNothingFoundID(layer.id));

      const queryableLayers = getQueryableLayers(layers);

      if (layer.id === queryableLayers[queryableLayers.length - 1].id) {
        setPos(null);
      }
    } else {
      dispatch(setVectorInfo(undefined));
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
  }: {
    focusMode: boolean;
    mode: UIMode;
    dispatch: Dispatch;
    setPos: (pos: [number, number] | null) => void;
  },
) =>
  layers.map((layer, i) => {
    if (layer.visible) {
      switch (layer.layerType) {
        case "wmts":
          return createCismapLayer({
            key: `${focusMode}_${i}_${layer.id}`,
            url: layer.props.url,
            maxZoom: MAX_ZOOM,
            layers: layer.props.name,
            format: "image/png",
            tiled: true,
            transparent: "true",
            pane: "additionalLayers1",
            opacity: layer.opacity.toFixed(1) || 0.7,
            type: "wmts",
          });
        case "vector":
          return createCismapLayer({
            key: `${focusMode}_${i}_${layer.id}_${layer.opacity}`,
            style: layer.props.style,
            maxZoom: MAX_ZOOM,
            pane: `additionalLayers${i}`,
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
              }),
          });
      }
    }
  });
