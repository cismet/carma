import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import type {
  FilterSpecification,
  MapGeoJSONFeature,
  MapOptions,
  StyleSpecification,
} from "maplibre-gl";
import maplibregl from "maplibre-gl";
import proj4 from "proj4";

import {
  ENDPOINT,
  isAreaType,
  METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ,
} from "@carma-commons/resources";
import { normalizeOptions } from "@carma-commons/utils";
import {
  LibreMapSelectionContent,
  SelectionItem,
  useHashState,
  useSelectionLibreMap,
} from "@carma-apps/portals";

import { proj4crs3857def, proj4crs4326def } from "../../helper/gisHelper.js";

import store from "../../store";
import {
  getSelectedFeature,
  setSelectedFeature,
} from "../../store/slices/features";
import {
  getBackgroundLayer,
  getLayers,
  setLibreMapRef,
} from "../../store/slices/mapping";
import { getUIMode, UIMode } from "../../store/slices/ui";

import LibreFeatureInfoBox from "../feature-info/LibreFeatureInfoBox";
import {
  addMarkerToMap,
  changeWmsVisibility,
  createFeature,
  getParamsMapLibre,
  layersToMapLibreStyle,
  zoom256as512,
} from "./libremap.utils";
import {
  cancelOngoingRequests,
  getCoordinates,
  onClickTopicMap,
  onSelectionChangedVector,
} from "./topicmap.utils";

import "maplibre-gl/dist/maplibre-gl.css";
import "./LibreGeoportalMap.css";

type ConfigurableMapOptionKeys =
  | "style"
  | "center"
  | "hash"
  | "zoom"
  | "minZoom"
  | "maxZoom"
  | "bearing"
  | "pitch"
  | "maxPitch";

export type LibreGeoportalMapOptions = Partial<
  Pick<MapOptions, ConfigurableMapOptionKeys>
>;

const defaultBackgroundStyle: StyleSpecification = {
  version: 8,
  sources: {
    "source-amtlich": {
      type: "raster",
      tiles: [METROPOLERUHR_WMTS_SPW2_WEBMERCATOR_HQ.layers.spw2_light.url],
      //tileSize: 512,
    },
  },
  layers: [
    {
      id: "layer-amtlich",
      type: "raster",
      source: "source-amtlich",
      paint: { "raster-opacity": 0.9 },
    },
  ],
};

const defaultMapOptions: Required<LibreGeoportalMapOptions> = {
  style: defaultBackgroundStyle,
  center: { lat: 51.256, lng: 7.150764 },
  zoom: 15,
  minZoom: 9,
  maxZoom: 21,
  maxPitch: 85,
  bearing: 0,
  pitch: 0,
  hash: false, // Disable builtin hash updater by default
};

const LibreGeoportalMap = ({
  mapOptions,
}: {
  mapOptions?: LibreGeoportalMapOptions;
}) => {
  const { updateHash, getHashValues } = useHashState();
  const normalizedMapOptions = useMemo(
    () => normalizeOptions(mapOptions, defaultMapOptions),
    [mapOptions]
  );

  const [globalHits, setGlobalHits] = useState({});
  const [foundFeatures, setFoundFeatures] = useState({});
  const [pos, setPos] = useState<[number, number]>([0, 0]);
  const isIdleRef = useRef(false);

  const dispatch = useDispatch();
  const selectedFeature = useSelector(getSelectedFeature);
  const selectedVectorFeaturesRef = useRef<Set<MapGeoJSONFeature>>(new Set());
  const [selectedVectorFeatures, setSelectedVectorFeatures] = useState<
    Set<MapGeoJSONFeature>
  >(new Set());
  const uiMode = useSelector(getUIMode);
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;

  const maxSelectionCount = 10;

  const uiModeRef = useRef(uiMode);
  const positionRef = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    positionRef.current = pos;
  }, [pos]);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const featureInfoMarkerRef = useRef<maplibregl.Marker | null>(null);
  const selectedFeatures: Set<{
    source: string;
    sourceLayer: string;
    id: string | number;
    selectionLayerId?: string;
  }> = new Set();

  const layers = useSelector(getLayers);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const onComplete = (
    selection: SelectionItem,
    triggerVisibilityChange?: boolean
  ) => {
    if (layers.filter((l) => l.layerType === "vector").length === 0) return;
    if (
      (uiMode === UIMode.DEFAULT || uiMode === UIMode.FEATURE_INFO) &&
      !isAreaType(selection.type as ENDPOINT)
    ) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);
      if (isIdleRef.current) {
        if (map.current) {
          changeWmsVisibility(map.current, layers, backgroundLayer, true);
          map.current.fire("click", {
            lngLat: {
              lat: selectedPos[1],
              lng: selectedPos[0],
            },
            target: map.current,
            type: "click",
            point: map.current.project([selectedPos[1], selectedPos[0]]),
            originalEvent: {
              preventDefault: () => {},
              stopPropagation: () => {},
            },
          });
        }
      } else {
        if (triggerVisibilityChange) {
          changeWmsVisibility(map.current, layers, backgroundLayer, false);
        }
        setTimeout(() => {
          onComplete(selection, false);
        }, 20);
      }
    }
  };

  useSelectionLibreMap({
    map: map.current,
    onComplete,
  });

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

  const updateGlobalHits = () => {
    Object.keys(globalHits).forEach((key) => {
      const foundLayer = layers.find((layer) => layer.id === key);
      if (!foundLayer || !foundLayer.visible) {
        globalHits[key] = undefined;
      }
    });
  };

  const resetSelection = (o?: Object) => {
    Object.keys(o).forEach((key) => {
      const hits = o[key];
      if (hits) {
        hits.forEach((hit) => {
          hit.setSelection(false, hit);
        });
      }
    });
  };

  const selectionHandler = (e, layer) => {
    setGlobalHits((old) => {
      return { ...old, [layer.id]: e.hits };
    });
  };

  useEffect(() => {
    if (map.current) return; // initialize map only once

    if (mapContainerRef.current) {
      const { lng, lat, zoom, bearing, pitch } = getHashValues();
      const mapOptionsFromHash = {
        center:
          typeof lng === "number" && typeof lat === "number"
            ? { lng, lat }
            : undefined,
        zoom: typeof zoom === "number" ? zoom256as512(zoom) : undefined,
        bearing: typeof bearing === "number" ? bearing : undefined,
        pitch: typeof pitch === "number" ? pitch : undefined,
      };

      const appliedMapOptions = normalizeOptions(
        mapOptionsFromHash,
        normalizedMapOptions
      );

      map.current = new maplibregl.Map({
        container: mapContainerRef.current,
        ...appliedMapOptions,
      });

      dispatch(setLibreMapRef(map));

      map.current.on("idle", () => {
        isIdleRef.current = true;
      });

      map.current.on("move", () => {
        isIdleRef.current = false;
      });

      map.current.on("click", (e) => {
        setPos([e.lngLat.lat, e.lngLat.lng]);
        const point = map.current.project([e.lngLat.lng, e.lngLat.lat]);
        const hits = map.current.queryRenderedFeatures(point);
        const currentIsModeFeatureInfo =
          uiModeRef.current === UIMode.FEATURE_INFO;
        if (currentIsModeFeatureInfo) {
          if (featureInfoMarkerRef.current) {
            featureInfoMarkerRef.current.setLngLat([
              e.lngLat.lng,
              e.lngLat.lat,
            ]);
          } else {
            featureInfoMarkerRef.current = addMarkerToMap(map.current, {
              lat: e.lngLat.lat,
              lng: e.lngLat.lng,
            });
          }

          const currentLayers = getLayers(store.getState());
          const hitsByLayer = currentLayers
            .map((layer) => {
              return {
                hits: hits.filter(
                  (hit) => hit.layer?.metadata?.["layer-id"] === layer.id
                ),
                layerId: layer.id,
              };
            })
            .filter((hit) => hit.hits.length > 0);

          hitsByLayer.forEach((layerHit) => {
            const layer = currentLayers.find(
              (layer) => layer.id === layerHit.layerId
            );
            const layerHits = layerHit.hits;
            if (!layer) {
              return;
            }
            // click listener from cismap

            const filteredHits = layerHits.filter((hit) => {
              //hit.layer.id should not contain selection
              return !hit.layer.id.includes("selection");
            });

            // Deselect all selected vector features first
            selectedVectorFeaturesRef.current.forEach((feature) => {
              try {
                map.current?.setFeatureState(
                  {
                    source: feature.source,
                    sourceLayer: feature.sourceLayer,
                    id: feature.id,
                  },
                  { selected: false }
                );
              } catch (error) {
                console.error("Error deselecting feature state:", error);
              }
            });

            setSelectedVectorFeatures(new Set());

            if (filteredHits.length > 0) {
              const limitedHits = filteredHits.slice(0, maxSelectionCount);

              const normalizedLimitedHits = [];

              limitedHits.forEach((hit) => {
                const setSelection = (selected) => {
                  map.current?.setFeatureState(
                    {
                      source: hit.source,
                      sourceLayer: hit.sourceLayer,
                      id: hit.id,
                    },
                    { selected }
                  );
                  setSelectedVectorFeatures((prev) => {
                    const newSet = new Set(prev);
                    if (selected) {
                      newSet.add(hit);
                    } else {
                      newSet.delete(hit);
                    }
                    return newSet;
                  });
                  selectedFeatures.add({
                    source: hit.source,
                    sourceLayer: hit.sourceLayer,
                    id: hit.id,
                  });
                };

                // @ts-expect-error
                hit.setSelection = setSelection;

                //add hit to normalizedLimitedHits if an object with the id isn't already in the array
                if (!normalizedLimitedHits.some((e) => e.id === hit.id)) {
                  normalizedLimitedHits.push(hit);
                }
              });
              // onSelectionChanged will be called here
              onSelectionChangedVector(
                {
                  hits: normalizedLimitedHits,
                  hit: normalizedLimitedHits[0],
                  latlng: e.lngLat,
                },
                {
                  layer,
                  dispatch,
                  selectionHandler,
                  map: map.current,
                }
              );
            }
          });

          onClickTopicMap(
            {
              latlng: e.lngLat,
            },
            {
              dispatch,
              mode: uiModeRef.current,
              store,
              zoom: map.current?.getZoom() + 1,
              map: map.current,
            }
          );
        } else {
          let filteredHits = hits.filter((hit) => {
            return !hit.layer.id.includes("selection");
          });

          // Clear all selection layers by resetting their filters
          selectedFeatures.forEach((feature) => {
            try {
              // If we have a selection layer ID, reset its filter
              if (
                feature.selectionLayerId &&
                map.current?.getLayer(feature.selectionLayerId)
              ) {
                // Set a filter that won't match any features
                map.current.setFilter(feature.selectionLayerId, [
                  "==",
                  "__selected__",
                  "true",
                ]);
              } else {
                map.current?.setFeatureState(
                  {
                    source: feature.source,
                    sourceLayer: feature.sourceLayer,
                    id: feature.id,
                  },
                  { selected: false }
                );
              }
            } catch (error) {
              console.error("Error clearing building selection:", error);
            }
          });

          selectedFeatures.clear();
          dispatch(setSelectedFeature(null));

          if (filteredHits.length > 0) {
            const selectedVectorFeature = filteredHits[0];

            const coordinates = getCoordinates(selectedVectorFeature.geometry);
            const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];
            const currentLayers = getLayers(store.getState());
            const layer = currentLayers.find((layer) => layer.id === layerId);
            let feature;
            if (layer) {
              feature = createFeature(selectedVectorFeature, layer);
            } else {
              if (!selectedVectorFeature.layer.id.includes("3D")) {
                return;
              }
              feature = {
                geometry: selectedVectorFeature.geometry,
                id: "3d_gebaeude",
                properties: {
                  header: "Gebäude Informationen",
                  title: selectedVectorFeature.properties.klasse,
                  subtitle:
                    "Höhe: " + selectedVectorFeature.properties.hoehe + "m",
                },
              };
            }

            if (feature) {
              if (layer) {
                map.current.setFeatureState(
                  {
                    source: selectedVectorFeature.source,
                    sourceLayer: selectedVectorFeature.sourceLayer,
                    id: selectedVectorFeature.id,
                  },
                  { selected: true }
                );
                selectedFeatures.add({
                  source: selectedVectorFeature.source,
                  sourceLayer: selectedVectorFeature.sourceLayer,
                  id: selectedVectorFeature.id,
                });
              } else {
                // Create a unique identifier for this building using its properties and coordinates
                const buildingType =
                  selectedVectorFeature.properties?.klasse || "";
                const buildingHeight =
                  selectedVectorFeature.properties?.hoehe || "";

                // Get the selection layer ID based on the original layer ID
                const originalLayerId = selectedVectorFeature.layer.id;
                const selectionLayerId = `${originalLayerId}-selection`;

                // Store information about the selected feature for later deselection
                const selectedInfo = {
                  source: selectedVectorFeature.source,
                  sourceLayer: selectedVectorFeature.sourceLayer,
                  id:
                    selectedVectorFeature.id ||
                    `${buildingType}-${buildingHeight}`,
                  selectionLayerId: selectionLayerId,
                  geometryCoordinates: JSON.stringify(
                    // @ts-expect-error
                    selectedVectorFeature.geometry.coordinates[0].slice(0, 3)
                  ),
                };

                // Update the selection layer filter to show this building
                if (map.current.getLayer(selectionLayerId)) {
                  const filterConditions: any[] = [
                    "all",
                    ["==", ["geometry-type"], "Polygon"],
                  ];

                  // Add building type condition if available
                  if (buildingType) {
                    filterConditions.push([
                      "==",
                      ["get", "klasse"],
                      buildingType,
                    ]);
                  }

                  // Add building height condition if available
                  if (buildingHeight) {
                    filterConditions.push([
                      "==",
                      ["get", "hoehe"],
                      buildingHeight,
                    ]);
                  }

                  // Add a condition to match the specific feature ID if available
                  if (selectedVectorFeature.id) {
                    filterConditions.push([
                      "==",
                      ["id"],
                      selectedVectorFeature.id,
                    ]);
                  }

                  if (false) {
                    map.current.setFilter(
                      selectionLayerId,
                      filterConditions as FilterSpecification
                    );
                  }
                } else {
                  console.warn("Selection layer not found:", selectionLayerId);
                }

                selectedFeatures.add(selectedInfo);
              }
              dispatch(setSelectedFeature(feature));
            }
          }
        }
      });

      map.current.on("zoomend", () => {
        const currentIsModeFeatureInfo =
          uiModeRef.current === UIMode.FEATURE_INFO;
        if (currentIsModeFeatureInfo && positionRef.current[0] !== 0) {
          map.current.fire("click", {
            lngLat: {
              lat: positionRef.current[0],
              lng: positionRef.current[1],
            },
            target: map.current,
            type: "click",
            point: map.current.project([
              positionRef.current[1],
              positionRef.current[0],
            ]),
            originalEvent: {
              preventDefault: () => {},
              stopPropagation: () => {},
            },
          });
        }
      });

      map.current.on("remove", () => {
        dispatch(setLibreMapRef(null));
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance || typeof updateHash !== "function") return;
    const handleMoveEnd = () => {
      if (!mapInstance) return;
      updateHash(getParamsMapLibre(mapInstance, defaultMapOptions), {
        label: "MapLibre",
      });
    };
    mapInstance.on("moveend", handleMoveEnd);
    return () => {
      mapInstance && mapInstance.off("moveend", handleMoveEnd);
    };
  }, [updateHash]);

  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        const style = await layersToMapLibreStyle(backgroundLayer, layers);
        map.current?.setStyle(style);
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [layers, backgroundLayer]);

  useEffect(() => {
    if (map.current) {
      if (isModeFeatureInfo) {
        map.current.getCanvas().style.cursor = "crosshair";
      } else {
        map.current.getCanvas().style.cursor = "grab";
        if (featureInfoMarkerRef.current) {
          featureInfoMarkerRef.current.remove();
          featureInfoMarkerRef.current = null;
        }
      }
    }
    if (uiModeRef.current !== uiMode) {
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
    uiModeRef.current = uiMode;
  }, [uiMode]);

  useEffect(() => {
    selectedVectorFeaturesRef.current = selectedVectorFeatures;
  }, [selectedVectorFeatures]);

  useEffect(() => {
    updateGlobalHits();
    if (selectedFeature && uiModeRef.current !== UIMode.DEFAULT) {
      resetSelection(globalHits);
      if (globalHits[selectedFeature.id]) {
        const hits = globalHits[selectedFeature.id];
        if (hits) {
          hits.forEach((hit) => {
            if (hit.id === selectedFeature.properties.wmsProps.vectorId) {
              hit.setSelection(true, hit);
            } else {
              hit.setSelection(false, hit);
            }
          });
        }
      }
    }
  }, [selectedFeature]);

  useEffect(() => {
    updateGlobalHits();
    if (uiModeRef.current === UIMode.DEFAULT) {
      const lastObject = getLastDefinedObject(globalHits);

      if (lastObject) {
        resetSelection(globalHits);
        const selectedVectorFeature = lastObject.value[0];
        if (selectedVectorFeature.setSelection) {
          selectedVectorFeature.setSelection(true);
          dispatch(setSelectedFeature(foundFeatures[lastObject.key]));
        }
      } else {
        dispatch(setSelectedFeature(null));
      }
    }
  }, [globalHits]);

  return (
    <>
      <LibreFeatureInfoBox pos={pos} libreMap={map.current} />
      <LibreMapSelectionContent map={map.current} />
      <div className="map-wrap">
        <div ref={mapContainerRef} className="maplibre-map-container" />
      </div>
    </>
  );
};

export default LibreGeoportalMap;
