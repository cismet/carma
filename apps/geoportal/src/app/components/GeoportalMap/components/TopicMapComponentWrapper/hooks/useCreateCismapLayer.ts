import {
  createElement,
  CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Dispatch } from "@reduxjs/toolkit";
import type { LatLng, Map } from "leaflet";

import CismapLayer from "react-cismap/CismapLayer";

import type { Layer, FeatureInfo } from "@carma/types";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import { setSelectedFeature } from "../../../../../store/slices/features";
import { setLayersIdle } from "../../../../../store/slices/mapping";

import { UIMode } from "../../../../../store/slices/ui";
import {
  cancelOngoingRequests,
  implicitVectorSelection,
  onSelectionChangedVector,
} from "../../../topicmap.utils";

const MAX_ZOOM = 26;

// Types for selection hits stored in globalHits
type VectorHit = {
  id?: string | number;
  selectionLayerExists?: boolean;
  setSelection?: (selected: boolean, hit?: unknown) => void;
};
type GlobalHits = Record<string, VectorHit[] | undefined>;

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
  onSelectionChanged?: (e: {
    hits: unknown[];
    hit: unknown;
    latlng: LatLng;
  }) => void;
  onStyleIdle?: (_?: unknown) => void;
}

const createCismapLayer = (props: WMTSLayerProps | VectorLayerProps) => {
  return createElement(CismapLayer, props);
};

export const useCreateCismapLayers = (
  layers: Layer[],
  {
    mode,
    dispatch,
    selectedFeature,
    leafletMap,
  }: {
    mode: UIMode;
    dispatch: Dispatch;
    selectedFeature: FeatureInfo | null;
    leafletMap: Map;
  }
) => {
  const [globalHits, setGlobalHits] = useState<GlobalHits>({});
  const [idleLayers, setIdleLayers] = useState<Record<string, boolean>>({});
  const [foundFeatures, setFoundFeatures] = useState<Record<string, FeatureInfo | undefined>>({});
  const flags = useFeatureFlags();

  const showTileBoundaries = flags?.debugTileBoundaries;
  const selectionHandler = (e: { hits: unknown[] }, layer: Layer) => {
    setGlobalHits((old) => {
      return { ...old, [layer.id]: e.hits };
    });
  };

  const featureHandler = (feature: FeatureInfo, layer: Layer) => {
    setFoundFeatures((old) => ({ ...old, [layer.id]: feature }));
  };

  const modeRef = useRef(mode);

  useEffect(() => {
    // rearrangeGlobalHits inline to avoid stale deps warning
    const newGlobalHits: GlobalHits = {};
    layers.forEach((layer) => {
      if (layer.visible) {
        newGlobalHits[layer.id] = globalHits[layer.id];
      }
    });
    setGlobalHits(newGlobalHits);
    setIdleLayers({});
  }, [layers, globalHits]);

  // We intentionally react only on mode changes here to preserve behavior
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (modeRef.current !== mode) {
      // inline updateGlobalHits
      Object.keys(globalHits).forEach((key) => {
        const foundLayer = layers.find((layer) => layer.id === key);
        if (!foundLayer || !foundLayer.visible) {
          globalHits[key] = undefined;
        }
      });
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
    // inline updateGlobalHits to keep deps minimal
    Object.keys(globalHits).forEach((key) => {
      const foundLayer = layers.find((layer) => layer.id === key);
      if (!foundLayer || !foundLayer.visible) {
        globalHits[key] = undefined;
      }
    });
    if (modeRef.current === UIMode.DEFAULT) {
      // find last defined object
      const keys = Object.keys(globalHits);
      let lastObject: { key: string; value: VectorHit[] } | undefined =
        undefined;
      for (let i = keys.length - 1; i >= 0; i--) {
        const value = globalHits[keys[i]];
        if (value !== undefined && value[0]?.selectionLayerExists) {
          lastObject = { key: keys[i], value } as {
            key: string;
            value: VectorHit[];
          };
          break;
        }
      }

      if (lastObject) {
        // resetSelection inline
        Object.keys(globalHits).forEach((key) => {
          const hits = globalHits[key];
          if (hits) {
            hits.forEach((hit) => {
              hit.setSelection && hit.setSelection(false);
            });
          }
        });
        const selectedVectorFeature = lastObject.value[0];
        if (selectedVectorFeature.setSelection) {
          selectedVectorFeature.setSelection(true);
          const f = foundFeatures[lastObject.key];
          if (f) {
            dispatch(setSelectedFeature(f));
          } else {
            dispatch(setSelectedFeature(null));
          }
        }
      } else {
        dispatch(setSelectedFeature(null));
      }
    }
  }, [globalHits, foundFeatures, layers, dispatch]);

  useEffect(() => {
    Object.keys(globalHits).forEach((key) => {
      const foundLayer = layers.find((layer) => layer.id === key);
      if (!foundLayer || !foundLayer.visible) {
        globalHits[key] = undefined;
      }
    });
    if (selectedFeature && modeRef.current !== UIMode.DEFAULT) {
      Object.keys(globalHits).forEach((key) => {
        const hits = globalHits[key];
        if (hits) {
          hits.forEach((hit) => {
            hit.setSelection && hit.setSelection(false);
          });
        }
      });
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
  }, [selectedFeature, globalHits, layers]);

  useEffect(() => {
    if (
      Object.keys(idleLayers).length ===
      layers.filter((l) => l.layerType === "vector").length
    ) {
      dispatch(setLayersIdle(true));
    }
  }, [idleLayers, layers, dispatch]);

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
            opacity: layer.opacity === 0 ? "0" : layer.opacity || 0.7,
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
            opacity: layer.opacity === 0 ? "0" : layer.opacity || 0.7,
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
            onStyleIdle: () => {
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
