import {
  createElement,
  CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Dispatch } from "@reduxjs/toolkit";
import type { LatLng, Map as LeafletMap } from "leaflet";

import CismapLayer from "react-cismap/CismapLayer";

import type { Layer } from "@carma/types";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { setSelectedFeature } from "../../../store/slices/features";
import { setLayersIdle, updateLayer } from "../../../store/slices/mapping";

import { UIMode } from "../../../store/slices/ui";
import {
  cancelOngoingRequests,
  implicitVectorSelection,
  onSelectionChangedVector,
} from "../topicmap.utils";
import { utils } from "@carma-appframeworks/portals";

const MAX_ZOOM = 26;

interface WMTSLayerProps {
  type: "wmts" | "wmts-nt";
  key: string;
  url: string;
  maxZoom: number;
  layers: string;
  format: string;
  opacity: string | number;
  tiled: boolean;
  transparent: string;
  pane?: string;
  additionalLayerUniquePane?: string;
  additionalLayersFreeZOrder?: number;
}

interface VectorLayerProps {
  type: "vector";
  key: string;
  style: CSSProperties | string;
  maxZoom: number;
  pane?: string;
  additionalLayerUniquePane?: string;
  additionalLayersFreeZOrder?: number;
  opacity: number | string;
  selectionEnabled?: boolean;
  manualSelectionManagement?: boolean;
  maxSelectionCount?: number;
  showTileBoundaries?: boolean;
  onSelectionChanged?: (e: { hits: any[]; hit: any; latlng: LatLng }) => void;
  onStyleIdle?: (e: any) => void;
  onMapLibreCoreMapReady?: (map: any) => void;
}

const createCismapLayer = (props: WMTSLayerProps | VectorLayerProps) => {
  return createElement(CismapLayer, props);
};

export const useCreateCismapLayers = (
  layers: Layer[],
  {
    mode,
    dispatch,
    zoom,
    selectedFeature,
    leafletMap,
    maplibreMapsRef,
  }: {
    mode: UIMode;
    dispatch: Dispatch;
    zoom: number;
    selectedFeature: any;
    leafletMap: LeafletMap;
    maplibreMapsRef?: React.MutableRefObject<Map<string, any>>;
  }
) => {
  const [globalHits, setGlobalHits] = useState({});
  const [idleLayers, setIdleLayers] = useState({});
  const [foundFeatures, setFoundFeatures] = useState({});
  const flags = useFeatureFlags();

  const showTileBoundaries = flags?.debugTileBoundaries;
  const selectionHandler = (e, layer) => {
    setGlobalHits((old) => {
      return { ...old, [layer.id]: e.hits };
    });
  };

  const featureHandler = (feature, layer) => {
    setFoundFeatures((old) => {
      return { ...old, [layer.id]: feature };
    });
  };

  const modeRef = useRef(mode);

  const getLastDefinedObject = (o: Object) => {
    const keys = Object.keys(o);
    for (let i = keys.length - 1; i >= 0; i--) {
      const value = o[keys[i]];
      if (value !== undefined && value[0].selectionLayerExists) {
        return { key: keys[i], value };
      }
    }
    return undefined;
  };

  const resetSelection = (o: Object) => {
    Object.keys(o).forEach((key) => {
      const hits = o[key];
      if (hits) {
        hits.forEach((hit) => {
          hit.setSelection(false);
        });
      }
    });
  };

  const updateGlobalHits = () => {
    Object.keys(globalHits).forEach((key) => {
      const foundLayer = layers.find((layer) => layer.id === key);
      if (!foundLayer || !foundLayer.visible) {
        globalHits[key] = undefined;
      }
    });
  };

  const rearrangeGlobalHits = () => {
    const newGlobalHits = {};
    layers.forEach((layer) => {
      if (layer.visible) {
        newGlobalHits[layer.id] = globalHits[layer.id];
      }
    });
    setGlobalHits(newGlobalHits);
  };

  useEffect(() => {
    rearrangeGlobalHits();
    setIdleLayers({});
  }, [layers]);

  useEffect(() => {
    if (modeRef.current !== mode) {
      updateGlobalHits();
      Object.keys(globalHits).forEach((key) => {
        const hits = globalHits[key];
        if (hits) {
          hits.forEach((hit) => {
            hit.setSelection(false);
          });
          globalHits[key] = undefined;
        }
      });
      cancelOngoingRequests();
    }
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    updateGlobalHits();
    if (modeRef.current === UIMode.DEFAULT) {
      const lastObject = getLastDefinedObject(globalHits);

      if (lastObject) {
        resetSelection(globalHits);
        const selectedVectorFeature = lastObject.value[0];
        if (selectedVectorFeature.setSelection) {
          selectedVectorFeature.setSelection(true);
          if (selectedVectorFeature?.state?.selected) {
            utils.zoomToFeature(
              foundFeatures[lastObject.key],
              leafletMap,
              [60, 60]
            );
          }
          dispatch(setSelectedFeature(foundFeatures[lastObject.key]));
        }
      } else {
        dispatch(setSelectedFeature(null));
      }
    }
  }, [globalHits, foundFeatures]);

  useEffect(() => {
    updateGlobalHits();
    if (selectedFeature && modeRef.current !== UIMode.DEFAULT) {
      resetSelection(globalHits);
      if (globalHits[selectedFeature.id]) {
        const hits = globalHits[selectedFeature.id];
        if (hits) {
          hits.forEach((hit) => {
            if (
              hit.id === selectedFeature.properties.wmsProps.vectorId ||
              hit?.properties?.id === selectedFeature.properties.wmsProps.id
            ) {
              hit.setSelection(true);
            } else {
              hit.setSelection(false);
            }
          });
        }
      }
    }
  }, [selectedFeature]);

  useEffect(() => {
    if (
      Object.keys(idleLayers).length ===
      layers.filter((l) => l.layerType === "vector").length
    ) {
      dispatch(setLayersIdle(true));
    }
  }, [idleLayers]);

  // const ntList = [""];

  return layers.map((layer, i) => {
    if (layer.visible) {
      switch (layer.layerType) {
        case "wmts-nt":
          return createCismapLayer({
            key: `${layer.id}`,
            url: layer.props.url,
            maxZoom: MAX_ZOOM,
            layers: layer.props.name,
            format: "image/png",
            tiled: true,
            transparent: "true",
            additionalLayerUniquePane: layer.id,
            additionalLayersFreeZOrder: i,
            opacity: layer.opacity.toFixed(1) || 0.7,
            type: "wmts-nt",
          });
        case "wmts":
          return createCismapLayer({
            key: `${layer.id}`,
            url: layer.props.url,
            maxZoom: MAX_ZOOM,
            layers: layer.props.name,
            format: "image/png",
            tiled: true,
            transparent: "true",
            additionalLayerUniquePane: layer.id,
            additionalLayersFreeZOrder: i,
            opacity: layer.opacity.toFixed(1) || 0.7,
            type: "wmts",
          });
        case "vector":
          return createCismapLayer({
            key: `${layer.id}`,
            style: layer.props.style,
            maxZoom: MAX_ZOOM,
            showTileBoundaries: showTileBoundaries,
            additionalLayerUniquePane: layer.id,
            additionalLayersFreeZOrder: i,
            opacity: layer.opacity === 0 ? "0" : layer.opacity || 0.7,
            type: "vector",
            selectionEnabled: true,
            manualSelectionManagement: true,
            maxSelectionCount: 10,
            onMapLibreCoreMapReady: (map) => {
              console.log("MapLibre map ready for layer:", layer.id, map);
              // Store map reference outside of Redux to avoid serialization issues
              if (maplibreMapsRef) {
                maplibreMapsRef.current.set(layer.id, map);
              }
            },
            onStyleIdle: (e) => {
              setIdleLayers((old) => {
                return { ...old, [layer.id]: true };
              });
            },
            onSelectionChanged: (e) => {
              if (modeRef.current === UIMode.DEFAULT) {
                implicitVectorSelection(e, {
                  layer,
                  dispatch,
                  selectionHandler,
                  featureHandler,
                  leafletMap,
                });
              } else if (modeRef.current === UIMode.FEATURE_INFO) {
                onSelectionChangedVector(e, {
                  layer,
                  dispatch,
                  selectionHandler,
                  map: leafletMap,
                });
              }
            },
          });
      }
    }
  });
};

export default useCreateCismapLayers;
