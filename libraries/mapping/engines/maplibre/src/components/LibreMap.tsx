import type { StyleSpecification } from "maplibre-gl";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cogProtocol } from "@geomatico/maplibre-cog-protocol";

// Register COG protocol once
maplibregl.addProtocol("cog", cogProtocol as any);
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getHashParams } from "@carma-commons/utils";
import { FeatureCollectionContext } from "react-cismap/contexts/FeatureCollectionContextProvider";
import PhotoLightBox from "react-cismap/topicmaps/PhotoLightbox";
import { TopicMapStylingContext } from "react-cismap/contexts/TopicMapStylingContextProvider";
import "../styles/map.css";
import {
  getVectorMapping,
  styleManipulation,
  vectorStylesToMapLibreStyle,
} from "../utils/styleBuilder";
import { createFeature } from "../utils/featureUtils";
import { zoom256as512, zoom512as256 } from "../utils/zoomUtils";
import { LibreMapSelectionContent } from "./LibreMapSelectionContent";
import { ENDPOINT, isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";
import { useSelectionLibreMap } from "../hooks/useSelectionLibreMap";
import { useLibreContext } from "../contexts/LibreContext";
import { useMapSelection } from "../contexts/MapSelectionContext";
import { useClusterMarkers } from "../hooks/useClusterMarkers";
import {
  WUPPERTAL_DEFAULT_STYLE,
  WUPPERTAL_CONFIG,
} from "../constants/wuppertalDefaultStyle";

// Import from portals temporarily until these are migrated
import { FeatureInfobox } from "@carma-appframeworks/portals";
import { SelectionItem, useSelection } from "@carma-appframeworks/portals";
import { defaultLayerConf } from "@carma-appframeworks/portals";
import { useMapHashRouting } from "@carma-appframeworks/portals";
import { displayRouteOnMap } from "@carma-mapping/routing";

export interface GeoJsonData {
  sourceId: string;
  data: GeoJSON.FeatureCollection;
}

export interface VectorStyle {
  name: string;
  style: string;
  layer?: string;
  opacity?: number;
  infoboxMapping?: string[];
}

export type LibreLayer =
  | ({ type: "vector" } & VectorStyle)
  | { type: "geojson"; name: string; data: string; infoboxMapping?: string[] }
  | { type: "cog"; name: string; url: string; opacity?: number };

export interface LibreMapProps {
  backgroundLayers?: string | null;
  layers?: LibreLayer[];
  setLibreMap?: (map: maplibregl.Map) => void;
  onProgressUpdate?: (progress: { current: number; total: number }) => void;
  filterFunction?: (
    map: maplibregl.Map,
    layers?: LibreLayer[],
    geoJsonData?: GeoJsonData[]
  ) => void;
  /** Override glyphs (font) URL. undefined = use from first vector layer style, string = use this URL */
  overrideGlyphs?: string;
  useRouting?: boolean;
  /** Enable visual selection via setFeatureState even without infoboxMapping */
  selectionEnabled?: boolean;
  onFeatureSelect?: (
    feature: any,
    selectionInfo?: {
      source: string;
      sourceLayer?: string;
      id?: string | number;
    }
  ) => void;
}

export const LibreMap = ({
  backgroundLayers,
  layers,
  setLibreMap,
  onProgressUpdate,
  filterFunction,
  overrideGlyphs,
  useRouting = false,
  selectionEnabled = true,
  onFeatureSelect,
}: LibreMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const selectedFeaturesRef = useRef<
    Set<{
      source: string;
      sourceLayer?: string;
      id?: string | number;
      selectionLayerId?: string;
    }>
  >(new Set());
  const mappingRef = useRef({});
  const onFeatureSelectRef = useRef(onFeatureSelect);
  onFeatureSelectRef.current = onFeatureSelect;
  const useRoutingRef = useRef(useRouting);
  useRoutingRef.current = useRouting;
  const isIdleRef = useRef(false);
  const vectorSourcesReadyRef = useRef(false);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const geoJsonMetadataRef = useRef<
    Array<{ sourceId: string; uniqueColors: string[] }>
  >([]);
  const isInitialGeoJsonLoad = useRef(true);

  const { clusteringEnabled } = useContext<typeof FeatureCollectionContext>(
    FeatureCollectionContext
  );
  const { markerSymbolSize } = useContext<typeof TopicMapStylingContext>(
    TopicMapStylingContext
  );
  const {
    setMapStyle,
    geoJsonMetadata,
    setGeoJsonMetadata,
    setMap: setContextMap,
  } = useLibreContext();

  const { selection } = useSelection();
  const selectionRef = useRef(selection);

  // Keep selectionRef in sync with selection
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // MapSelectionContext: provides programmatic selection API.
  // When no MapSelectionProvider exists, the default no-op context is returned
  // and LibreMap falls back to its local state behavior.
  const mapSelectionCtx = useMapSelection();
  const mapSelectionCtxRef = useRef(mapSelectionCtx);
  mapSelectionCtxRef.current = mapSelectionCtx;
  const lastHandledVersionRef = useRef(0);

  // Helper: clear all visual selection state on the map
  const clearVisualSelection = useCallback(
    (mapInstance: maplibregl.Map) => {
      selectedFeaturesRef.current.forEach((feature) => {
        try {
          if (
            feature.selectionLayerId &&
            mapInstance.getLayer(feature.selectionLayerId)
          ) {
            mapInstance.setFilter(feature.selectionLayerId, [
              "==",
              "__selected__",
              "true",
            ]);
          } else {
            mapInstance.setFeatureState(
              {
                source: feature.source,
                sourceLayer: feature.sourceLayer,
                id: feature.id,
              },
              { selected: false },
            );
          }
        } catch (error) {
          console.error("Error clearing feature selection:", error);
        }
      });
      selectedFeaturesRef.current.clear();
    },
    [],
  );

  // Helper: apply visual selection highlighting for a feature
  const applyVisualSelection = useCallback(
    (
      mapInstance: maplibregl.Map,
      featureId: { source: string; sourceLayer?: string; id?: string | number },
    ) => {
      try {
        mapInstance.setFeatureState(
          {
            source: featureId.source,
            sourceLayer: featureId.sourceLayer,
            id: featureId.id,
          },
          { selected: true },
        );
        selectedFeaturesRef.current.add({
          source: featureId.source,
          sourceLayer: featureId.sourceLayer,
          id: featureId.id,
        });
      } catch (error) {
        console.error("Error applying feature selection:", error);
      }
    },
    [],
  );

  useClusterMarkers({
    map: map.current,
    geoJsonMetadata: clusteringEnabled ? geoJsonMetadata : [],
  });

  const defaultLng = 7.150764;
  const defaultLat = 51.256;
  const defaultZoom = 15;

  // Helper function to build WMS tile URL from layer config
  const buildWMSTileUrl = (layerConfig: any): string => {
    const {
      url,
      layers,
      version = "1.1.1",
      format = "image/png",
    } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMS&REQUEST=GetMap&VERSION=${version}&LAYERS=${layers}&FORMAT=${format}&styles=default&TRANSPARENT=true&WIDTH=256&HEIGHT=256&crs=EPSG:3857&&srs=EPSG:3857&BBOX={bbox-epsg-3857}`;
  };

  // Helper function to build WMTS tile URL from layer config
  const buildWMTSTileUrl = (layerConfig: any): string => {
    const { url, layers } = layerConfig;
    const baseUrl = url.endsWith("?") ? url : url + "?";
    return `${baseUrl}SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layers}&STYLE=default&FORMAT=image/png&TILEMATRIXSET=webmercator_hq&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}`;
  };

  // Parse backgroundLayers string and build style.
  // Returns { style, vectorBackgroundLayers } where vectorBackgroundLayers
  // are vector-type backgrounds that need to be prepended to libreLayers.
  const buildBackgroundStyle = (): {
    style: StyleSpecification | null;
    vectorBackgroundLayers: LibreLayer[];
  } => {
    if (backgroundLayers === undefined) {
      // Prop not provided: use default background for backwards compat
      return { style: WUPPERTAL_DEFAULT_STYLE, vectorBackgroundLayers: [] };
    }
    if (backgroundLayers === null || backgroundLayers === "") {
      // Explicitly null or empty: no background layer
      return {
        style: { version: 8 as const, sources: {}, layers: [] },
        vectorBackgroundLayers: [],
      };
    }

    const layerSpecs = backgroundLayers.split("|");
    const sources: Record<string, any> = {};
    const vectorBgLayers: LibreLayer[] = [];

    // Add terrain source from config
    if (WUPPERTAL_CONFIG.terrain) {
      sources["terrainSource"] = {
        type: "raster-dem",
        tiles: [WUPPERTAL_CONFIG.terrain.url],
        tileSize: WUPPERTAL_CONFIG.terrain.tileSize ?? 512,
        maxzoom: WUPPERTAL_CONFIG.terrain.maxzoom ?? 15,
      };
    }
    const styleLayers: any[] = [];

    layerSpecs.forEach((spec, index) => {
      const [layerName, opacityStr] = spec.split("@");
      const layerConfig = defaultLayerConf.namedLayers[layerName];

      if (!layerConfig) {
        console.warn(`Layer "${layerName}" not found in defaultLayerConf`);
        return;
      }

      const opacity = opacityStr ? parseInt(opacityStr, 10) / 100 : 1.0;

      // Vector backgrounds get handled as libreLayers (prepended before data layers)
      if (layerConfig.type === "vector") {
        vectorBgLayers.push({
          type: "vector",
          name: `bg-${layerName}`,
          style: layerConfig.style,
          opacity,
        });
        return;
      }
      const sourceId = `source-${layerName}-${index}`;
      const layerId = `layer-${layerName}-${index}`;

      // Build source based on layer type
      if (layerConfig.type === "tiles") {
        sources[sourceId] = {
          type: "raster",
          tiles: [layerConfig.url],
          tileSize: 256,
        };
      } else if (
        layerConfig.type === "wmts" ||
        layerConfig.type === "wmts-nt"
      ) {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMTSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else if (layerConfig.type === "wms" || layerConfig.type === "wms-nt") {
        sources[sourceId] = {
          type: "raster",
          tiles: [buildWMSTileUrl(layerConfig)],
          tileSize: 256,
        };
      } else {
        console.warn(
          `Layer type "${layerConfig.type}" not supported for MapLibre`,
        );
        return;
      }

      // Add layer
      styleLayers.push({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": opacity },
      });
    });

    // If only vector backgrounds and no raster layers, use an empty style
    // so the vector background becomes the sole base layer
    if (styleLayers.length === 0 && vectorBgLayers.length > 0) {
      return {
        style: { version: 8 as const, sources, layers: [] },
        vectorBackgroundLayers: vectorBgLayers,
      };
    }

    // If no valid layers were parsed at all, return default style
    if (styleLayers.length === 0) {
      return { style: WUPPERTAL_DEFAULT_STYLE, vectorBackgroundLayers: [] };
    }

    return {
      style: { version: 8, sources, layers: styleLayers },
      vectorBackgroundLayers: vectorBgLayers,
    };
  };

  const { style: backgroundStyle, vectorBackgroundLayers } = useMemo(
    () => buildBackgroundStyle(),
    [backgroundLayers],
  );

  useEffect(() => {
    // Only initialize if we have a container and no map yet
    if (mapContainer.current && !map.current) {
      const hashParams = getHashParams();

      const lng =
        hashParams["lng"] !== undefined
          ? parseFloat(hashParams["lng"])
          : defaultLng;

      const lat =
        hashParams["lat"] !== undefined
          ? parseFloat(hashParams["lat"])
          : defaultLat;

      const zoom =
        hashParams["zoom"] !== undefined
          ? parseFloat(hashParams["zoom"]) - 1
          : defaultZoom;

      const mapInstance = new maplibregl.Map({
        container: mapContainer.current,
        style: backgroundStyle,
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
      });
      map.current = mapInstance;
      setLibreMap?.(mapInstance);
      setContextMap(mapInstance);

      mapInstance.on("click", async (e) => {
        const point = mapInstance.project([e.lngLat.lng, e.lngLat.lat]);
        const hits = mapInstance.queryRenderedFeatures(point);
        const filteredHits = hits.filter((hit) => {
          return (
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster")
          );
        });

        // Clear previous visual selection
        clearVisualSelection(mapInstance);
        setSelectedFeature(null);
        mapSelectionCtxRef.current.clearSelection();

        if (filteredHits.length > 0) {
          const selectedVectorFeature = filteredHits[0];
          const featureId = {
            source: selectedVectorFeature.source,
            sourceLayer: selectedVectorFeature.sourceLayer,
            id: selectedVectorFeature.id,
          };

          // Try to get layer ID from metadata (for vector layers)
          const layerId = selectedVectorFeature.layer?.metadata?.["layer-id"];

          // Try to get mapping by layer ID first, then by source (for geojson layers)
          const layerMapping =
            mappingRef.current[layerId] ||
            mappingRef.current[selectedVectorFeature.source];

          let feature = null;
          if (layerMapping) {
            feature = await createFeature(
              selectedVectorFeature,
              layerMapping,
              mapInstance,
              useRouting,
            );
          }

          // Apply visual selection if we have a mapping OR if selectionEnabled is true
          if (layerMapping || selectionEnabled) {
            applyVisualSelection(mapInstance, featureId);
          }

          if (feature) {
            setSelectedFeature(feature);
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            mapSelectionCtxRef.current.selectFeature(featureId, selectedVectorFeature);
            lastHandledVersionRef.current = mapSelectionCtxRef.current.selectionVersion + 1;
            onFeatureSelect?.(feature, featureId);
          } else if (selectionEnabled) {
            // No feature/mapping but selection enabled: still update context
            mapSelectionCtxRef.current.selectFeature(featureId, selectedVectorFeature);
            lastHandledVersionRef.current = mapSelectionCtxRef.current.selectionVersion + 1;
            onFeatureSelect?.(null, featureId);
          }
        } else {
          if (selectionRef.current) {
            const pos = proj4(proj4crs3857def, proj4crs4326def, [
              selectionRef.current.x,
              selectionRef.current.y,
            ]);
            setSelectedFeature({
              properties: {
                header: "Informationen",
                title: selectionRef.current.string,
                genericLinks: [
                  {
                    iconname: "car",
                    action: async () => {
                      if (!mapInstance) return;
                      const startLat = 51.2725699;
                      const startLng = 7.199918;
                      await displayRouteOnMap({
                        mapInstance,
                        from: { lat: startLat, lng: startLng },
                        to: { lat: pos[1], lng: pos[0] },
                      });
                    },
                  },
                ],
              },
            });
          }
        }
      });

      const checkVectorSourcesReady = () => {
        const style = mapInstance.getStyle();
        if (!style || !style.sources) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const vectorSources = Object.entries(style.sources).filter(
          ([_, source]: [string, any]) => source.type === "vector"
        );

        if (vectorSources.length === 0) {
          vectorSourcesReadyRef.current = false;
          return;
        }

        const allLoaded = vectorSources.every(([sourceId]) =>
          mapInstance.isSourceLoaded(sourceId)
        );

        vectorSourcesReadyRef.current = allLoaded;
      };

      mapInstance.on("sourcedata", (e) => {
        if (e.isSourceLoaded && e.source.type === "vector") {
          checkVectorSourcesReady();
        }
      });

      mapInstance.on("idle", () => {
        isIdleRef.current = true;
      });

      mapInstance.on("move", () => {
        if (layers?.find((layer) => layer.type === "vector")) {
          vectorSourcesReadyRef.current = false;
        } else {
          vectorSourcesReadyRef.current = true;
        }
        isIdleRef.current = false;
      });
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
        setContextMap(null);
      }
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    const updateMapStyle = async () => {
      try {
        // Prepend vector background layers before data layers
        const effectiveLayers = vectorBackgroundLayers.length > 0
          ? [...vectorBackgroundLayers, ...(layers || [])]
          : layers;

        if (effectiveLayers) {
          // Show initial progress only on first load or when layers change
          const geoJsonLayers = effectiveLayers.filter(
            (layer) => layer.type === "geojson"
          );

          // Check if geojson layers have changed by comparing with previous metadata
          const hasGeoJsonLayersChanged =
            geoJsonLayers.length !== geoJsonMetadataRef.current.length;

          if (hasGeoJsonLayersChanged) {
            isInitialGeoJsonLoad.current = true;
          }

          if (
            geoJsonLayers.length > 0 &&
            onProgressUpdate &&
            isInitialGeoJsonLoad.current
          ) {
            onProgressUpdate({ current: 0, total: geoJsonLayers.length });
          }

          // Update with vector styles and background layers
          const { style: baseStyle, geoJsonMetadata } =
            await vectorStylesToMapLibreStyle({
              layers: effectiveLayers,
              backgroundStyle,
              clusteringEnabled,
              overrideGlyphs,
            });

          // Apply marker symbol size scaling
          const style = styleManipulation(markerSymbolSize, baseStyle);

          // Store geojson metadata for pie chart rendering (local ref and context)
          geoJsonMetadataRef.current = geoJsonMetadata;
          setGeoJsonMetadata(geoJsonMetadata);

          // Save terrain state before setting style
          const currentTerrain = map.current?.getTerrain();

          map.current?.setStyle(style);

          // Update context with the full map style
          setMapStyle(style);

          // Add COG layers after style is loaded (requires addSource/addLayer, not setStyle).
          // Use beforeId to insert at correct z-position based on effectiveLayers order.
          const cogEntries = effectiveLayers
            .map((l, i) => ({ layer: l, index: i }))
            .filter((e) => e.layer.type === "cog");
          if (cogEntries.length > 0 && map.current) {
            const addCogLayers = () => {
              if (!map.current) return;
              const styleLayers = map.current.getStyle().layers || [];
              cogEntries.forEach(({ layer, index: cogIndex }) => {
                if (layer.type !== "cog" || !map.current) return;
                const sourceId = `cog-source-${layer.name}`;
                if (map.current.getSource(sourceId)) {
                  map.current.removeLayer(`cog-layer-${layer.name}`);
                  map.current.removeSource(sourceId);
                }
                // Find first style layer with z-index > cogIndex to insert before
                let beforeId: string | undefined;
                for (const sl of styleLayers) {
                  const meta = (sl as any).metadata;
                  if (meta && typeof meta["z-index"] === "number" && meta["z-index"] >= cogIndex) {
                    beforeId = sl.id;
                    break;
                  }
                }
                map.current.addSource(sourceId, {
                  type: "raster",
                  url: `cog://${layer.url}`,
                  tileSize: 256,
                });
                map.current.addLayer(
                  {
                    id: `cog-layer-${layer.name}`,
                    source: sourceId,
                    type: "raster",
                    paint: {
                      "raster-opacity": layer.opacity ?? 1,
                    },
                  },
                  beforeId,
                );
              });
            };
            if (map.current.isStyleLoaded()) {
              addCogLayers();
            } else {
              map.current.once("styledata", addCogLayers);
            }
          }

          // Restore terrain after style is loaded if it was previously set
          if (currentTerrain && map.current) {
            const restoreTerrain = () => {
              if (map.current?.getSource("terrainSource")) {
                map.current.setTerrain(currentTerrain);
              }
            };

            if (map.current.isStyleLoaded()) {
              restoreTerrain();
            } else {
              map.current.once("styledata", restoreTerrain);
            }
          }

          // Get mapping for vector layers (only from user-provided layers, not backgrounds)
          const vectorLayers = (layers || []).filter(
            (layer) => layer.type === "vector"
          );
          let mapping = {};
          if (vectorLayers.length > 0) {
            mapping = await getVectorMapping(vectorLayers);
          }

          // Add mapping for geojson layers
          geoJsonLayers.forEach((layer, index) => {
            if (layer.infoboxMapping && layer.infoboxMapping.length > 0) {
              const sourceId = `geojson-source-${index}`;
              mapping[layer.name] = layer.infoboxMapping;
              // Also map by source ID for easier lookup
              mapping[sourceId] = layer.infoboxMapping;
            }
          });

          mappingRef.current = mapping;

          // Apply filter function after style is loaded
          if (filterFunction && map.current) {
            const applyFilter = () => {
              if (map.current) {
                filterFunction(map.current, layers);
              }
            };

            if (map.current.isStyleLoaded()) {
              applyFilter();
            } else {
              map.current.once("styledata", applyFilter);
            }
          }

          // Track progress for geojson layers
          if (geoJsonMetadata.length > 0 && onProgressUpdate) {
            const loadedSources = new Set<string>();

            const handleStyleLoad = () => {
              const handleData = (e: any) => {
                const isRelevantSource = geoJsonMetadata.some(
                  ({ sourceId }) => e.sourceId === sourceId
                );
                if (!isRelevantSource || !e.isSourceLoaded) return;

                if (!loadedSources.has(e.sourceId)) {
                  loadedSources.add(e.sourceId);
                  if (isInitialGeoJsonLoad.current) {
                    onProgressUpdate({
                      current: loadedSources.size,
                      total: geoJsonMetadata.length,
                    });

                    if (loadedSources.size === geoJsonMetadata.length) {
                      isInitialGeoJsonLoad.current = false;
                    }
                  }
                }
              };

              map.current!.on("data", handleData);
            };

            if (map.current!.isStyleLoaded()) {
              handleStyleLoad();
            } else {
              map.current!.once("styledata", handleStyleLoad);
            }
          } else if (onProgressUpdate) {
            onProgressUpdate({ current: 1, total: 1 });
          }
        } else {
          // Only update background layers
          map.current?.setStyle(backgroundStyle);
          setMapStyle(backgroundStyle);
          geoJsonMetadataRef.current = [];
        }
      } catch (error) {
        console.error("Error updating map style:", error);
      }
    };

    updateMapStyle();
  }, [
    backgroundStyle,
    vectorBackgroundLayers,
    layers,
    clusteringEnabled,
    markerSymbolSize,
    filterFunction,
  ]);

  const getLeafletMap = useCallback(() => {
    const m = map.current;
    if (!m) return null;
    return {
      setView: (center: { lat: number; lng: number }, zoom?: number) => {
        if (typeof zoom === "number") m.setZoom(zoom256as512(zoom));
        m.setCenter([center.lng, center.lat]);
      },
      panTo: (center: { lat: number; lng: number }) =>
        m.panTo([center.lng, center.lat]),
      setZoom: (zoom: number) => m.setZoom(zoom256as512(zoom)),
      getCenter: () => m.getCenter(),
      once: (type: string, fn: (...args: unknown[]) => void) =>
        m.once(type, fn),
    };
  }, []);

  const getLeafletZoom = useCallback(() => {
    const m = map.current;
    return m ? zoom512as256(m.getZoom()) : 12;
  }, []);

  const hashRoutingLabels = useMemo(
    () => ({
      clearCesium: "LGM:2D:clearCesium",
      writeLeafletLike: "LGM:2D:writeLocation",
      topicMapLocation: "LGM:2D:location",
    }),
    [],
  );

  const { handleTopicMapLocationChange } = useMapHashRouting({
    getLeafletMap,
    getLeafletZoom,
    labels: hashRoutingLabels,
  });

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;
    const handleMoveEnd = () => {
      const center = mapInstance.getCenter();
      const zoom = zoom512as256(mapInstance.getZoom());
      handleTopicMapLocationChange({ lat: center.lat, lng: center.lng, zoom });
    };
    mapInstance.on("moveend", handleMoveEnd);
    return () => {
      mapInstance && mapInstance.off("moveend", handleMoveEnd);
    };
  }, [handleTopicMapLocationChange]);

  // Watch for external selection changes from MapSelectionContext
  // (e.g., a list component calling selectFeature())
  const {
    selectionVersion,
    selectedFeatureId: ctxSelectedFeatureId,
    rawFeature: ctxRawFeature,
  } = mapSelectionCtx;

  useEffect(() => {
    const mapInstance = map.current;
    if (!mapInstance) return;

    // Skip if we already handled this version (it was our own update)
    if (selectionVersion <= lastHandledVersionRef.current) {
      return;
    }
    lastHandledVersionRef.current = selectionVersion;

    // If selection was cleared externally
    if (!ctxSelectedFeatureId) {
      clearVisualSelection(mapInstance);
      setSelectedFeature(null);
      return;
    }

    // Apply visual selection for the externally selected feature
    clearVisualSelection(mapInstance);
    applyVisualSelection(mapInstance, ctxSelectedFeatureId);

    // If a raw feature was provided, run createFeature to get the processed result
    if (ctxRawFeature) {
      const layerId = ctxRawFeature.layer?.metadata?.["layer-id"];
      const layerMapping =
        mappingRef.current[layerId] ||
        mappingRef.current[ctxSelectedFeatureId.source];

      if (layerMapping) {
        void createFeature(
          ctxRawFeature,
          layerMapping,
          mapInstance,
          useRoutingRef.current,
        ).then((feature) => {
          if (feature) {
            setSelectedFeature(feature);
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            onFeatureSelectRef.current?.(feature, ctxSelectedFeatureId);
          }
        });
      }
    }
  }, [
    selectionVersion,
    ctxSelectedFeatureId,
    ctxRawFeature,
    clearVisualSelection,
    applyVisualSelection,
  ]);

  // Wait for vector sources to be ready, with timeout
  const waitForVectorSources = (
    maxAttempts = 50,
    interval = 20
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      let attempts = 0;
      const check = () => {
        if (vectorSourcesReadyRef.current) {
          resolve(true);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(check, interval);
        } else {
          console.warn("Vector sources did not load in time");
          resolve(false);
        }
      };
      check();
    });
  };

  const onComplete = async (selection: SelectionItem) => {
    if (!isAreaType(selection.type as ENDPOINT)) {
      const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
        selection.x,
        selection.y,
      ]);

      const ready = await waitForVectorSources();
      if (ready && map.current) {
        const mapInstance = map.current;
        // Query rendered features at the gazetteer position (no synthetic click needed)
        const point = mapInstance.project([selectedPos[0], selectedPos[1]]);
        const hits = mapInstance.queryRenderedFeatures(point);
        const filteredHits = hits.filter(
          (hit) =>
            !hit.layer.id.includes("selection") &&
            !hit.layer.id.includes("cluster"),
        );

        // Clear previous visual selection
        clearVisualSelection(mapInstance);
        setSelectedFeature(null);
        mapSelectionCtxRef.current.clearSelection();

        if (filteredHits.length > 0) {
          const selectedVectorFeature = filteredHits[0];
          const featureId = {
            source: selectedVectorFeature.source,
            sourceLayer: selectedVectorFeature.sourceLayer,
            id: selectedVectorFeature.id,
          };

          const layerId =
            selectedVectorFeature.layer?.metadata?.["layer-id"];
          const layerMapping =
            mappingRef.current[layerId] ||
            mappingRef.current[selectedVectorFeature.source];

          let feature = null;
          if (layerMapping) {
            feature = await createFeature(
              selectedVectorFeature,
              layerMapping,
              mapInstance,
              useRouting,
            );
          }

          if (feature) {
            if (layerMapping) {
              applyVisualSelection(mapInstance, featureId);
            }
            setSelectedFeature(feature);

            mapSelectionCtxRef.current.selectFeature(featureId, selectedVectorFeature);
            mapSelectionCtxRef.current.setSelectedFeature(feature);
            lastHandledVersionRef.current =
              mapSelectionCtxRef.current.selectionVersion + 1;

            onFeatureSelect?.(feature, featureId);
          }
        }
      }
    }
  };

  useSelectionLibreMap({
    map: map.current,
    onComplete,
  });

  return (
    <>
      <FeatureInfobox
        selectedFeature={
          selectedFeature
            ? {
                ...selectedFeature,
                properties: {
                  info: {
                    ...selectedFeature.properties,
                  },
                },
              }
            : null
        }
        libreMap={map.current}
        versionData={{
          version: "0.1.0",
        }}
      />
      <PhotoLightBox />
      <LibreMapSelectionContent map={map.current} />

      <div className="map-wrap">
        <div ref={mapContainer} className="map" />
      </div>
    </>
  );
};

export default LibreMap;
