import {
  createElement,
  CSSProperties,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Dispatch, Store } from "@reduxjs/toolkit";
import L, { type LatLng, type Map as LeafletMap } from "leaflet";
import type maplibregl from "maplibre-gl";
import centroid from "@turf/centroid";

import CismapLayer from "react-cismap/CismapLayer";

import type { Layer } from "@carma-mapping/layers";
import { useFeatureFlags } from "@carma-providers/feature-flag";

import type { RootState } from "../../../store";

import {
  clearTriggerSelectionById,
  getTriggerSelectionById,
  setSelectedFeature,
} from "../../../store/slices/features";
import {
  setLayersIdle,
  updateLayerFromLayerInfo,
} from "../../../store/slices/mapping";
import {
  applyDynamicStyling,
  extractCarmaConf,
  setLastAppliedSelection,
} from "@carma-mapping/components";

import { UIMode } from "../../../store/slices/ui";
import {
  cancelOngoingRequests,
  implicitVectorSelection,
  onSelectionChangedVector,
  resolveHit,
} from "../topicmap.utils";
import { utils } from "@carma-appframeworks/portals";
import { selectionPadding } from "../../../constants/selection";
import { isSupportedLeafletMapLibreAdhocLayer } from "../../../helper/adhoc-feature-utils";

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
  onStyleData?: (map: maplibregl.Map) => void;
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
    store,
    selectionSemanticIdentifierRef,
    setMaplibreMaps,
  }: {
    mode: UIMode;
    dispatch: Dispatch;
    zoom: number;
    selectedFeature: any;
    leafletMap: LeafletMap;
    maplibreMapsRef?: React.MutableRefObject<Map<string, any>>;
    store: Store;
    selectionSemanticIdentifierRef?: React.MutableRefObject<string | undefined>;
    setMaplibreMaps?: (entry: { id: string; map: any }) => void;
  }
) => {
  const [globalHits, setGlobalHits] = useState({});
  const [idleLayers, setIdleLayers] = useState({});
  const [foundFeatures, setFoundFeatures] = useState({});
  const [semanticIdForHits, setSemanticIdForHits] = useState<
    string | undefined
  >(undefined);
  const lastClickLatlngRef = useRef<string | null>(null);
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
  const layersRef = useRef(layers);
  layersRef.current = layers;

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

    if (maplibreMapsRef) {
      const visibleVectorLayerIds = layers
        .filter((l) => l.visible && l.layerType === "vector")
        .map((l) => l.id);
      maplibreMapsRef.current.forEach((_, layerId) => {
        if (!visibleVectorLayerIds.includes(layerId)) {
          maplibreMapsRef.current.delete(layerId);
        }
      });
    }
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

  const getSemanticMatch = (hits: Object, semanticId: string | undefined) => {
    if (!semanticId) return undefined;
    const keys = Object.keys(hits);
    for (let i = keys.length - 1; i >= 0; i--) {
      const value = hits[keys[i]];
      if (!value || !value[0]?.selectionLayerExists) continue;
      const layerForHits = layers.find((l) => l.id === keys[i]);
      const semanticInfo = layerForHits?.conf?.semanticInfo as
        | Record<string, { layers: string[] }>
        | undefined;
      if (!semanticInfo) continue;
      const semanticEntry = semanticInfo[semanticId];
      if (semanticEntry) {
        const match = value.find((h) =>
          semanticEntry?.layers?.includes(h.layer?.id)
        );
        if (match) return { key: keys[i], value };
      }
    }
    return undefined;
  };

  useEffect(() => {
    updateGlobalHits();
    if (modeRef.current === UIMode.DEFAULT) {
      const lastObject =
        getSemanticMatch(globalHits, semanticIdForHits) ||
        getLastDefinedObject(globalHits);

      if (lastObject) {
        resetSelection(globalHits);
        const layerForHits = layers.find((l) => l.id === lastObject.key);
        const semanticInfo = layerForHits?.conf?.semanticInfo as
          | Record<string, { layers: string[] }>
          | undefined;
        const selectedVectorFeature = resolveHit(
          lastObject.value,
          semanticInfo,
          semanticIdForHits
        );
        if (selectedVectorFeature.setSelection) {
          selectedVectorFeature.setSelection(true);
          if (selectedVectorFeature?.state?.selected) {
            utils.zoomToFeature({
              selectedFeature: foundFeatures[lastObject.key],
              leafletMap,
              padding: selectionPadding,
            });
          }
          dispatch(setSelectedFeature(foundFeatures[lastObject.key]));
        }
      } else {
        dispatch(setSelectedFeature(null));
      }
    }
  }, [globalHits, foundFeatures, semanticIdForHits]);

  useEffect(() => {
    updateGlobalHits();
    if (selectedFeature && modeRef.current !== UIMode.DEFAULT) {
      resetSelection(globalHits);
      if (globalHits[selectedFeature.id]) {
        const hits = globalHits[selectedFeature.id];
        const vectorId =
          selectedFeature.vectorId ||
          selectedFeature.properties.sourceProps.id ||
          selectedFeature.properties?.wmsProps?.id;
        if (hits) {
          hits.forEach((hit) => {
            if (hit.id === vectorId || hit?.properties?.id === vectorId) {
              hit.setSelection(true);
            } else {
              hit.setSelection(false);
            }
          });
        }
      }
    }
  }, [selectedFeature, globalHits]);

  useEffect(() => {
    if (
      Object.keys(idleLayers).length ===
      layers.filter((l) => l.layerType === "vector").length
    ) {
      dispatch(setLayersIdle(true));
    }
  }, [idleLayers]);

  // const ntList = [""];

  const cismapLayers = layers.filter((layer) => layer.props);

  return cismapLayers.map((layer, i) => {
    if (layer.visible && isSupportedLeafletMapLibreAdhocLayer(layer)) {
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
            onStyleData: (() => {
              const configs = Array.isArray(layer.dynamicStyling)
                ? layer.dynamicStyling
                : layer.dynamicStyling
                ? [layer.dynamicStyling]
                : [];
              if (!configs.length) return undefined;
              return (map: maplibregl.Map) => {
                const latestState = store.getState() as RootState;
                const latestLayer = latestState?.mapping?.layers?.find(
                  (l: Layer) => l.id === layer.id
                );
                const latestSelections: Record<number, string> =
                  latestLayer &&
                  typeof latestLayer.dynamicStylingSelection === "object" &&
                  latestLayer.dynamicStylingSelection !== null
                    ? latestLayer.dynamicStylingSelection
                    : {};
                const initialCarmaConf = extractCarmaConf(
                  map.style?.stylesheet
                );
                if (initialCarmaConf) {
                  dispatch(
                    updateLayerFromLayerInfo({
                      id: layer.id,
                      layerInfo: {},
                      carmaConf: initialCarmaConf,
                    })
                  );
                }
                configs.forEach((config, idx) => {
                  const sel = latestSelections[idx];
                  const effectiveSel = sel ?? config.default;
                  if (!sel || sel === config.default) {
                    setLastAppliedSelection(layer.id, idx, effectiveSel);
                    return;
                  }
                  if (config.type === "list" || config.type === "toggle") {
                    const result = applyDynamicStyling(
                      map,
                      layer.id,
                      config,
                      sel
                    );
                    setLastAppliedSelection(layer.id, idx, sel);
                    if (result?.layerInfo || result?.carmaConf) {
                      dispatch(
                        updateLayerFromLayerInfo({
                          id: layer.id,
                          layerInfo: result.layerInfo ?? {},
                          carmaConf: result.carmaConf ?? undefined,
                        })
                      );
                    }
                  }
                });
              };
            })(),
            onMapLibreCoreMapReady: (map) => {
              console.log("MapLibre map ready for layer:", layer.id, map);

              // Store map reference outside of Redux to avoid serialization issues
              if (maplibreMapsRef) {
                maplibreMapsRef.current.set(layer.id, map);
              }

              if (setMaplibreMaps) {
                setMaplibreMaps({ id: layer.id, map });
              }

              const triggerSelectionById = getTriggerSelectionById(
                store.getState()
              );
              if (triggerSelectionById !== layer.id) {
                return;
              }
              dispatch(clearTriggerSelectionById());

              if (leafletMap && modeRef.current === UIMode.DEFAULT) {
                const style = map.getStyle();
                if (style?.sources) {
                  const featuresWithGeometry: GeoJSON.Feature[] = [];

                  for (const sourceKey in style.sources) {
                    const source = style.sources[sourceKey] as any;
                    if (
                      source?.data &&
                      source.data.type === "FeatureCollection"
                    ) {
                      const featureCollection = source.data;
                      if (featureCollection.features) {
                        featuresWithGeometry.push(
                          ...featureCollection.features.filter(
                            (f: GeoJSON.Feature) =>
                              f.geometry &&
                              (f.properties as { kind?: unknown } | null)
                                ?.kind !== "label"
                          )
                        );
                      }
                    }
                  }

                  const autoSelect = layer.conf?.autoSelect;

                  if (autoSelect === false) {
                    return;
                  }

                  let featureToSelect: GeoJSON.Feature | undefined;

                  if (
                    typeof autoSelect === "string" ||
                    typeof autoSelect === "number"
                  ) {
                    featureToSelect = featuresWithGeometry.find(
                      (f) =>
                        f.id === autoSelect || f.properties?.id === autoSelect
                    );
                  } else if (featuresWithGeometry.length === 1) {
                    featureToSelect = featuresWithGeometry[0];
                  }

                  if (featureToSelect?.geometry) {
                    const center = centroid(
                      featureToSelect as GeoJSON.Feature<GeoJSON.Geometry>
                    );
                    const [lng, lat] = center.geometry.coordinates;
                    const latlngPoint = L.latLng(lat, lng);

                    leafletMap.fireEvent("click", {
                      latlng: latlngPoint,
                      layerPoint: leafletMap.latLngToLayerPoint(latlngPoint),
                      containerPoint:
                        leafletMap.latLngToContainerPoint(latlngPoint),
                    });
                  }
                }
              }
            },
            onStyleIdle: (e) => {
              setIdleLayers((old) => {
                return { ...old, [layer.id]: true };
              });
            },
            onSelectionChanged: (e) => {
              const currentLayer =
                layersRef.current.find((l) => l.id === layer.id) || layer;
              const clickKey = e.latlng
                ? `${e.latlng.lat},${e.latlng.lng}`
                : null;
              const isNewClick = clickKey !== lastClickLatlngRef.current;
              lastClickLatlngRef.current = clickKey;

              const semanticIdentifier =
                selectionSemanticIdentifierRef?.current;
              if (selectionSemanticIdentifierRef) {
                selectionSemanticIdentifierRef.current = undefined;
              }

              if (isNewClick) {
                // First layer of a new click: set semantic ID (or clear if undefined)
                setSemanticIdForHits(semanticIdentifier);
              }
              if (modeRef.current === UIMode.DEFAULT) {
                implicitVectorSelection(e, {
                  layer: currentLayer,
                  dispatch,
                  selectionHandler,
                  featureHandler,
                  leafletMap,
                  semanticIdentifier,
                });
              } else if (modeRef.current === UIMode.FEATURE_INFO) {
                onSelectionChangedVector(e, {
                  layer: currentLayer,
                  dispatch,
                  selectionHandler,
                  map: leafletMap,
                  store,
                });
              }
            },
          });
      }
    }
  });
};

export default useCreateCismapLayers;
